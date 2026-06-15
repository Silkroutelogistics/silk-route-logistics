import { api } from "./api";

// v3.8.anc — SRL Driver Academy T5: fetch+blob file download via the api client
// (sends the httpOnly auth cookie + surfaces 401/404 errors), matching the
// codebase's established PDF-download convention rather than a bare <a href>.
export async function downloadFromApi(path: string, filename: string): Promise<void> {
  const res = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
