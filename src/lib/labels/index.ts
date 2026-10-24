// Renameable UI strings in one place (PC.3). "Share" was renamed to "Community";
// change it here only and every nav item, page title, and copy string updates.
export const COMMUNITY_LABEL = "Community" as const;

/** Routes still use a stable slug; only user-visible text uses the label. */
export const COMMUNITY_SLUG = "community" as const;
