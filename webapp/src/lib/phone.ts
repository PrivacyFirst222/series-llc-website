/** Every phone box on the site behaves the same (Adam, 7 Sep 2026): the
 *  empty box hints the bare shape, no letters, and the digits take the
 *  shape as they are typed. */
export const PHONE_HINT = "(   )    -    ";

/** (xxx) xxx-xxxx as typed; ten digits at most. */
export const formatPhone = (value: string): string => {
  const d = value.replace(/\D/g, "").slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};
