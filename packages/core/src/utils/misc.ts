// Somehow, @types/node doesn't contain the Error type, so it comes from the browser, where the error code doesn't exist.
export const isFileNotFoundError = (e: unknown): e is Error => e instanceof Error && "code" in e && e.code === "ENOENT";
