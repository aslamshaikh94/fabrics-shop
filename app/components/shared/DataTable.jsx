"use client";
import { memo } from "react";
import { Pencil, Trash2 } from "lucide-react";

const ALIGN = { left: "text-left", center: "text-center", right: "text-right" };

/**
 * Shared table chrome. Replaces the repeated
 * `text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider`
 * header strings and the Pencil/Trash2 action-cell block found on every list
 * page.
 */

const Th = memo(function Th({ align = "left", className = "", children }) {
  return (
    <th
      className={`${ALIGN[align] || ALIGN.left} px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${className}`}
    >
      {children}
    </th>
  );
});

const Td = memo(function Td({ align = "left", className = "", children }) {
  return <td className={`${ALIGN[align] || ALIGN.left} px-4 py-3 ${className}`}>{children}</td>;
});

/**
 * Standard edit + delete button pair used at the end of most rows.
 * `align`: "center" (default) or "right".
 */
const EditDeleteActions = memo(function EditDeleteActions({
  onEdit,
  onDelete,
  align = "center",
  children,
}) {
  const btn =
    "p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 transition-colors";
  const trashBtn =
    "p-1.5 hover:bg-red-50 rounded-lg text-gray-500 hover:text-red-600 transition-colors";
  return (
    <div
      className={`flex items-center ${
        align === "right" ? "justify-end" : "justify-center"
      } gap-1`}
    >
      {children}
      {onEdit && (
        <button onClick={onEdit} className={btn} title="Edit">
          <Pencil className="w-4 h-4" />
        </button>
      )}
      {onDelete && (
        <button onClick={onDelete} className={trashBtn} title="Delete">
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
});

export { Th, Td, EditDeleteActions };
