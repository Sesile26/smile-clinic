import { cn } from "@/lib/cn";

/**
 * Auto-refresh switch shared by the realtime admin tables (/admin/orders,
 * /admin/appointments). A real `role="switch"` button, so it's keyboard-operable
 * out of the box (Tab to focus, Space/Enter to toggle) and announces its state.
 */
export function AutoRefreshToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Автооновлення таблиці"
      onClick={onChange}
      className="inline-flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-1"
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors duration-200",
          checked ? "bg-mint-600" : "bg-navy-400/30",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
            checked && "translate-x-4",
          )}
        />
      </span>
      <span className="text-xs font-medium text-navy-700">Автооновлення</span>
    </button>
  );
}
