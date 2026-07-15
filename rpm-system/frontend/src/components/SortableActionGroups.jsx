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
    <div ref={setNodeRef} style={style} className={`md-drag-row ${isDragging ? 'dragging' : ''}`}>
      <button
        type="button"
        className="md-drag-handle"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      <div className="md-drag-row-body">{children}</div>
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
        <div key={group.gkey} className="md-group">
          <div className={`md-group-head md-group-${group.cls}`}>
            <span>{group.label}</span>
            <span className="md-group-count">{group.items.length}</span>
          </div>
          <SortableContext items={group.items.map(it => it.id)} strategy={verticalListSortingStrategy}>
            {group.items.map(action => (
              <SortableRow key={action.id} id={action.id}>
                {renderRow(action)}
              </SortableRow>
            ))}
          </SortableContext>
        </div>
      ))}
    </DndContext>
  );
}
