import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import './ActionRow.css';

// Touch- and mouse-friendly reordering for the priority-grouped action lists.
// Uses @dnd-kit (pointer + touch + keyboard) with a dedicated drag handle so the
// row's own buttons keep working. Reordering is constrained to within a group.

function SortableRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
    position: isDragging ? 'relative' : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className={`ag-row ${isDragging ? 'dragging' : ''}`}>
      <button
        type="button"
        className="ag-handle"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={15} />
      </button>
      <div className="ag-row-body">{children}</div>
    </div>
  );
}

export default function SortableActionGroups({ groups, onReorder, renderRow }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const group = groups.find(g => g.items.some(it => it.id === active.id));
    // Only reorder when both items are in the same priority/completion group.
    if (!group || !group.items.some(it => it.id === over.id)) return;
    const oldIndex = group.items.findIndex(it => it.id === active.id);
    const newIndex = group.items.findIndex(it => it.id === over.id);
    const reordered = arrayMove(group.items, oldIndex, newIndex);
    const ids = groups.flatMap(g => (g === group ? reordered : g.items).map(it => it.id));
    onReorder(ids);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      {groups.map(group => (
        <section key={group.gkey} className={`ag-group ${group.cls}`} aria-label={group.label}>
          <div className="ag-head">
            <i className="ag-dot" />
            <span className="ag-label">{group.label}</span>
            <span className="ag-count">{group.items.length}</span>
          </div>
          <div className="ag-list">
            <SortableContext items={group.items.map(it => it.id)} strategy={verticalListSortingStrategy}>
              {group.items.map(action => (
                <SortableRow key={action.id} id={action.id}>
                  {renderRow(action)}
                </SortableRow>
              ))}
            </SortableContext>
          </div>
        </section>
      ))}
    </DndContext>
  );
}
