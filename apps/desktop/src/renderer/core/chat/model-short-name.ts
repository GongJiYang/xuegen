/**
 * Short display name for a model, for the menu bar's right corner.
 *
 * The user asked to see the current model at a glance (B4); a full name like
 * "DeepSeek V4 Flash" is too long for the 20px menu bar, so this derives a short
 * token. It is pure: the caller passes the model's id and name.
 */

/**
 * Pick the most distinguishing short token from a model's name or id.
 *
 * Preference order: a known family word (Flash / Pro / …) spelled out in the
 * name, then the last id segment, then the whole name. Case is preserved as the
 * id usually carries it (e.g. `flash`, `pro`).
 */
export function shortModelName(name: string, id: string): string {
  const source = `${name} ${id}`;
  for (const token of ["flash", "pro", "mini", "turbo", "opus", "sonnet", "haiku"]) {
    if (new RegExp(token, "i").test(source)) {
      return token.charAt(0).toUpperCase() + token.slice(1);
    }
  }
  const idTail = id.split("/").filter(Boolean).pop();
  return idTail ?? name ?? id;
}
