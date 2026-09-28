import { motion, type HTMLMotionProps } from "motion/react";
import { useDialogFocus } from "./useDialogFocus";

// Keeps each existing drawer's layout/animation while sharing modal behavior.
export function DrawerSurface({ onClose, busy = false, ...props }: HTMLMotionProps<"div"> & {
  onClose: () => void;
  busy?: boolean;
}) {
  const focus = useDialogFocus(onClose, busy, { modal: true });
  return <motion.div {...props} {...focus} />;
}
