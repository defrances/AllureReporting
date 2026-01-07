import { createHash } from "node:crypto";

export const md5 = (data: string) => createHash("md5").update(data).digest("hex");
