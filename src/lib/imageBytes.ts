import { getBytes, ref } from "firebase/storage";
import { storage } from "./firebase";

export async function loadImageObjectUrl(storagePath: string): Promise<string> {
  const r = ref(storage, storagePath);
  const bytes = await getBytes(r);
  const blob = new Blob([bytes]);
  return URL.createObjectURL(blob);
}
