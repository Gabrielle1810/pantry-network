"use client";

// Phone Add stock: camera → reading → review → saved, keep going. Drives the
// headless reducer in src/lib/intake and does the I/O (read, save). "Type it
// instead" swaps in the typed form inside the same phone frame.
import { useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addFlowReducer,
  initialAddFlow,
  isSavable,
  toSaveBody,
  type ReviewDraft,
} from "@/lib/intake";
import { toDataUrl, type PreparedImage } from "@/lib/image";
import { PhoneFrame, PhoneHeader } from "./PhoneFrame";
import { CameraScreen } from "./CameraScreen";
import { ReviewScreen } from "./ReviewScreen";
import { SavedScreen } from "./Saved";
import { TypedAddForm } from "./TypedAddForm";
import { newKey, readLabel, saveStock } from "./api";

export function PhoneAddFlow({ today, prefill }: { today: string; prefill: Partial<ReviewDraft> | null }) {
  const router = useRouter();
  // Opened from "Add items" on Inventory → start in the typed form, prefilled.
  const [state, dispatch] = useReducer(addFlowReducer, prefill, (p) => initialAddFlow(newKey(), p ? "typing" : "camera"));
  const [typedPrefill, setTypedPrefill] = useState(prefill);

  function finish() {
    router.push("/inventory");
    router.refresh();
  }

  async function capture(image: PreparedImage) {
    const mode = state.cameraMode;
    dispatch({ type: "SHUTTER", photo: toDataUrl(image) });
    const r = await readLabel(image.base64, mode === "date" ? "date_only" : "read");
    if (r.kind === "error") {
      dispatch({ type: "READ_FAILED", message: r.message });
    } else if (mode === "date") {
      dispatch({ type: "DATE_READ", read: r.kind === "ok" ? r.read : null });
    } else if (r.kind === "ok") {
      dispatch({ type: "READ_OK", read: r.read, remembered: r.remembered, provider: r.provider });
    } else {
      dispatch({ type: "READ_UNREADABLE", provider: r.provider });
    }
  }

  async function save() {
    if (state.step !== "review" || !isSavable(state.draft)) return;
    const body = toSaveBody({
      draft: state.draft,
      read: state.read,
      baseline: state.baseline,
      photoDates: state.photoDates,
      idempotencyKey: state.idempotencyKey,
    });
    dispatch({ type: "CONFIRM_SAVE" });
    const r = await saveStock(body);
    dispatch(r.ok ? { type: "SAVE_OK", summary: r.summary } : { type: "SAVE_FAILED", message: r.message });
  }

  let screen: React.ReactNode;
  if (state.step === "camera" || state.step === "reading") {
    screen = (
      <CameraScreen
        key={state.cameraMode}
        mode={state.cameraMode}
        reading={state.step === "reading"}
        error={state.error}
        deliveryCount={state.delivery.length}
        onCapture={capture}
        onTypeInstead={() => dispatch({ type: "TYPE_INSTEAD" })}
        onClose={finish}
        onBack={() => dispatch({ type: "CANCEL_DATE_PHOTO" })}
      />
    );
  } else if (state.step === "typing") {
    screen = (
      <TypedAddForm
        key={state.idempotencyKey}
        variant="phone"
        prefill={typedPrefill}
        idempotencyKey={state.idempotencyKey}
        onSaved={(summary) => {
          setTypedPrefill(null);
          dispatch({ type: "TYPED_SAVED", summary });
        }}
        header={
          <>
            <PhoneHeader action={{ label: "Close", onClick: finish }} />
            <button
              type="button"
              onClick={() => dispatch({ type: "BACK_TO_CAMERA" })}
              className="min-h-11 self-start text-[15px] font-medium text-green"
            >
              Use the camera instead
            </button>
          </>
        }
      />
    );
  } else if (state.step === "saved" && state.saved) {
    screen = (
      <SavedScreen
        summary={state.saved}
        delivery={state.delivery}
        onAddAnother={() => dispatch({ type: "ADD_ANOTHER", idempotencyKey: newKey() })}
        onFinish={finish}
      />
    );
  } else {
    screen = <ReviewScreen state={state} dispatch={dispatch} today={today} onSave={save} />;
  }

  return <PhoneFrame>{screen}</PhoneFrame>;
}
