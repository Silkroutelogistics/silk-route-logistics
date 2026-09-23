/**
 * C5 — the AE sees what SRL can prove, and an absent fact says so.
 *
 * The load-bearing property is that MISSING evidence renders as a sentence
 * rather than as an empty row. An empty row is indistinguishable from a field
 * the panel failed to read, and the whole point of this surface is that a
 * person can tell the difference.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ExecutionEvidencePanel from "./ExecutionEvidencePanel";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...a: unknown[]) => get(...a) } }));
const downloadFromApi = vi.fn();
vi.mock("@/lib/download", () => ({
  downloadFromApi: (...a: unknown[]) => downloadFromApi(...a),
}));

const SIGNED = {
  id: "rc-1",
  rateConNumber: "SRL-121500R",
  status: "SIGNED",
  signed: true,
  signedAt: "2026-09-20T10:00:00.000Z",
  signerName: "Jordan Carrier",
  signerIp: "203.0.113.7",
  contentHash: "abc123def456",
  counterSignedByName: "Wasi Haider",
  counterSignedByTitle: "President",
  counterSignedAt: "2026-09-19T09:00:00.000Z",
};

function mount(props: Record<string, unknown> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ExecutionEvidencePanel loadId="load-1" {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: [SIGNED] });
});

describe("a signed, countersigned, accepted load shows the whole chain", () => {
  it("renders the signer, the IP, the hash and the countersignature", async () => {
    mount({
      carrierAcceptedAt: "2026-09-19T08:00:00.000Z",
      carrierAcceptedVia: "TENDER_ACCEPT",
      carrierAcceptedByUserId: "u-carrier",
    });

    await waitFor(() => expect(screen.getByTestId("execution-evidence")).toBeInTheDocument());
    expect(screen.getByText("Jordan Carrier")).toBeInTheDocument();
    expect(screen.getByText("203.0.113.7")).toBeInTheDocument();
    expect(screen.getByText("abc123def456")).toBeInTheDocument();
    expect(screen.getByText(/Wasi Haider, President/)).toBeInTheDocument();
    // The act, in words rather than the enum the database stores.
    expect(screen.getByText("Accepted the tender")).toBeInTheDocument();
  });

  it("offers the certificate through the api client, not a bare link", async () => {
    mount({ carrierAcceptedAt: "2026-09-19T08:00:00.000Z", carrierAcceptedVia: "TENDER_ACCEPT" });
    await waitFor(() => expect(screen.getByTestId("execution-evidence")).toBeInTheDocument());

    const btn = screen.getByRole("button", { name: /Certificate of Electronic Signature/ });
    btn.click();
    await waitFor(() =>
      expect(downloadFromApi).toHaveBeenCalledWith(
        "/rate-confirmations/rc-1/certificate",
        "SRL-121500R-signature-certificate.pdf",
      ),
    );
  });
});

describe("an absent fact is stated, never left blank", () => {
  it("says Not signed rather than rendering empty rows", async () => {
    get.mockResolvedValue({
      data: [{ ...SIGNED, signed: false, signedAt: null, signerName: null, signerIp: null, contentHash: null }],
    });
    mount({ carrierAcceptedAt: "2026-09-19T08:00:00.000Z", carrierAcceptedVia: "PICKUP_ARRIVAL" });

    await waitFor(() => expect(screen.getByTestId("evidence-not-signed")).toBeInTheDocument());
    expect(screen.getByTestId("evidence-not-signed").textContent).toMatch(/Not signed/);
    // No certificate offered for a document nobody signed.
    expect(screen.queryByRole("button", { name: /Certificate/ })).toBeNull();
  });

  it("says Not countersigned on an RC issued before countersigning existed", async () => {
    get.mockResolvedValue({
      data: [{ ...SIGNED, counterSignedByName: null, counterSignedByTitle: null, counterSignedAt: null }],
    });
    mount({ carrierAcceptedAt: "2026-09-19T08:00:00.000Z" });

    await waitFor(() => expect(screen.getByTestId("evidence-no-countersign")).toBeInTheDocument());
    // Not a manufactured name: those rows are genuinely un-countersigned.
    expect(screen.queryByText(/Wasi Haider/)).toBeNull();
  });

  it("names the absence of an acceptance, and says a status does not imply one", async () => {
    mount({ carrierAcceptedAt: null });

    await waitFor(() => expect(screen.getByTestId("evidence-no-acceptance")).toBeInTheDocument());
    expect(screen.getByTestId("evidence-no-acceptance").textContent).toMatch(
      /can reach a dispatched status without one/i,
    );
  });

  it("explains a null actor rather than showing a blank", async () => {
    // The token signing path has no session at all, so byUserId is null BY
    // DESIGN. A blank there would read as a lookup that failed.
    mount({ carrierAcceptedAt: "2026-09-20T10:00:00.000Z", carrierAcceptedVia: "RC_SIGNATURE" });

    await waitFor(() => expect(screen.getByTestId("execution-evidence")).toBeInTheDocument());
    expect(screen.getByText(/signed by link, no session/)).toBeInTheDocument();
  });
});

describe("the panel does not appear when there is nothing to say", () => {
  it("renders nothing with no acceptance and no rate confirmation", async () => {
    get.mockResolvedValue({ data: [] });
    const { container } = mount({ carrierAcceptedAt: null });
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
    expect(container.querySelector('[data-testid="execution-evidence"]')).toBeNull();
  });
});
