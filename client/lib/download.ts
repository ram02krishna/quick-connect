import { toast } from "sonner";
import api from "./api";

/**
 * Downloads through the API proxy so the file keeps its real name. The request is
 * made with the Authorization header — navigating to the URL directly depended on
 * a cookie that isn't sent in every deployment, and failed with a raw JSON error page.
 */
export async function downloadFile(url: string, fileName: string) {
  const toastId = toast.loading(`Downloading ${fileName}…`);
  try {
    const res = await api.get("/media/download", {
      params: { url, name: fileName },
      responseType: "blob",
      timeout: 120_000,
    });

    const objectUrl = URL.createObjectURL(res.data as Blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);

    toast.success("Download started", { id: toastId });
  } catch {
    toast.error("Couldn't download that file.", { id: toastId });
  }
}
