/**
 * B7b (2026-09-17) — the carrier documents page turns the server's step-up
 * refusal into a prompt, mints at the carrier door, and replays the upload.
 *
 * Without this the bcr gate is a 403 with no prompt: the carrier clicks Upload
 * and nothing happens (the v3.8.awy dead end). The page does not know which
 * types are gated — the server decides — so a POD goes through untouched, and a
 * failure that is NOT the step-up ask is shown as the error it is rather than
 * swallowed by run() resolving false.
 *
 * Adversarially verified at authoring: removing the StepUpPrompt mount turns
 * the replay case red (no dialog); dropping `...headers` from the replay turns
 * it red (no token on the third call); treating a cancelled prompt as done
 * turns the cancel case red (the form closes).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.setConfig({ testTimeout: 30_000 });

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/download", () => ({
  apiHref: (p: string) => p,
  openPdfFromApi: vi.fn(),
  extractApiError: vi.fn(async (_e: unknown, fallback: string) => fallback),
}));

import { api } from "@/lib/api";
import Page from "./page";

const get = api.get as unknown as ReturnType<typeof vi.fn>;
const post = api.post as unknown as ReturnType<typeof vi.fn>;

const stepUpRefusal = { response: { status: 403, data: { code: "STEP_UP_REQUIRED", error: "Enter the code from your authenticator app to confirm this change.", action: "compliance-document" } } };
const file = new File(["%PDF-1.4 fixture"], "coi-2026.pdf", { type: "application/pdf" });

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
}

/** Open the panel, pick a type, attach the file, press Upload. */
async function upload(user: ReturnType<typeof userEvent.setup>, docType: string, loadId?: string) {
  await user.click(screen.getByRole("button", { name: /Upload Document/ }));
  const selects = screen.getAllByRole("combobox");
  await user.selectOptions(selects[0], docType);
  if (loadId) await user.selectOptions(screen.getAllByRole("combobox")[1], loadId);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, file);
  await user.click(screen.getByRole("button", { name: "Upload" }));
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockImplementation((url: string) => {
    if (url.startsWith("/carrier-compliance/documents")) return Promise.resolve({ data: { documents: [] } });
    if (url.startsWith("/carrier-loads/my-loads")) return Promise.resolve({ data: { loads: [{ id: "L1", referenceNumber: "SRL-140001", originCity: "Detroit", destCity: "Chicago" }] } });
    return Promise.reject(new Error(`unexpected get ${url}`));
  });
});

describe("a compliance document", () => {
  it("403 STEP_UP_REQUIRED opens the prompt; the code is verified at /carrier-auth/step-up and the upload replays with the token and the same multipart body", async () => {
    const user = userEvent.setup();
    post.mockImplementation((url: string, _body: unknown, opts?: { headers?: Record<string, string> }) => {
      if (url === "/documents/upload") {
        if (opts?.headers?.["x-step-up-token"] === "tok-1") return Promise.resolve({ data: [{ id: "doc-1" }] });
        return Promise.reject(stepUpRefusal);
      }
      if (url === "/carrier-auth/step-up") return Promise.resolve({ data: { stepUpToken: "tok-1", expiresInMinutes: 10 } });
      return Promise.reject(new Error(`unexpected post ${url}`));
    });
    mount();
    await upload(user, "COI");

    // The refusal became a prompt, not an error line.
    expect(await screen.findByText("Confirm this document")).toBeTruthy();
    expect(screen.queryByText(/Upload failed/)).toBeNull();
    await user.type(screen.getByPlaceholderText("000000"), "123456");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    // The panel closes on success, which is the page's own "done".
    await waitFor(() => expect(screen.queryByRole("button", { name: "Upload" })).toBeNull());

    const urls = post.mock.calls.map((c) => c[0]);
    expect(urls).toEqual(["/documents/upload", "/carrier-auth/step-up", "/documents/upload"]);
    expect(post.mock.calls[1][1]).toEqual({ code: "123456", action: "compliance-document" });
    const replay = post.mock.calls[2];
    expect(replay[2]).toEqual({ headers: { "Content-Type": "multipart/form-data", "x-step-up-token": "tok-1" } });
    const body = replay[1] as FormData;
    expect(body.get("docType")).toBe("COI");
    expect((body.get("files") as File).name).toBe("coi-2026.pdf");
  });

  it("cancelling the prompt replays nothing, reports nothing, and leaves the form as it was", async () => {
    const user = userEvent.setup();
    post.mockRejectedValue(stepUpRefusal);
    mount();
    await upload(user, "W9");
    expect(await screen.findByText("Confirm this document")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByText("Confirm this document")).toBeNull());
    expect(post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Upload" })).toBeTruthy();
    expect(screen.getByText("coi-2026.pdf")).toBeTruthy();
    expect(screen.queryByText(/Upload failed/)).toBeNull();
  });

  it("a refusal that is not the step-up ask is shown as its own message, with no prompt", async () => {
    const user = userEvent.setup();
    post.mockRejectedValue({ response: { status: 400, data: { error: 'File "coi-2026.pdf" content does not match its file type. Upload rejected.' } } });
    mount();
    await upload(user, "AUTHORITY");
    expect(await screen.findByText(/content does not match its file type/)).toBeTruthy();
    expect(screen.queryByText("Confirm this document")).toBeNull();
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe("a load document", () => {
  it("a POD goes to /carrier-loads/:id/documents once, with no prompt and no step-up call", async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ data: { id: "doc-2" } });
    mount();
    await screen.findByRole("button", { name: /Upload Document/ });
    await upload(user, "POD", "L1");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Upload" })).toBeNull());
    expect(post.mock.calls.map((c) => c[0])).toEqual(["/carrier-loads/L1/documents"]);
    expect(screen.queryByText("Confirm this document")).toBeNull();
  });
});
