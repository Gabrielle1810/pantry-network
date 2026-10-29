// The toast after "Record items out", with its 10-second Undo. Shared by
// Take-out and the Inventory selection bar so both say the same thing.
import { reasonLabel } from "@/lib/takeout";
import type { useToast } from "@/components/ui/Toast";
import { postTakeout } from "./api";
import type { RecordedInfo } from "./RecordOutModal";

export function showRecorded(info: RecordedInfo, toast: ReturnType<typeof useToast>, refresh: () => void) {
  const n = info.count;
  const noun = `${n} item${n === 1 ? "" : "s"}`;
  const message =
    info.reason === "moved_to_community"
      ? `Set aside ${noun} for an offer. Your stock hasn't changed yet.`
      : `Recorded ${noun} · ${(reasonLabel(info.reason) ?? "").toLowerCase()}`;
  toast.show(message, {
    undo: async () => {
      const r = await postTakeout({ action: "undo", groupId: info.groupId, offerIds: info.offerIds });
      refresh();
      toast.show(r.ok ? "Undone" : "Too late to undo that one. Use Fix on the entry instead.");
    },
  });
}
