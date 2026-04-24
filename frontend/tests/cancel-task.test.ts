/**
 * Tests for cancel-task button behavior
 */

import {describe, it, expect, beforeEach} from 'vitest';
import {fireEvent} from '@testing-library/dom';

const TERMINAL_TASK_STATES = new Set([
  'completed',
  'canceled',
  'cancelled',
  'failed',
  'rejected',
]);

interface SuccessfulAgentResponseEvent {
  kind: 'task' | 'status-update' | 'artifact-update' | 'message';
  id: string;
  taskId?: string;
  final?: boolean;
  status?: {state: string};
}

interface ErrorAgentResponseEvent {
  id: string;
  error: string;
}

type AgentResponseEvent =
  | SuccessfulAgentResponseEvent
  | ErrorAgentResponseEvent;

// Minimal harness that mirrors the cancel-related logic in script.ts so the
// behavior can be exercised without the full DOMContentLoaded initialization.
function setupCancelHarness() {
  document.body.innerHTML = `
    <button id="send-btn">Send</button>
    <button id="cancel-btn" class="hidden" title="Cancel the running task">Cancel</button>
  `;

  const cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement;
  let activeTaskId: string | null = null;
  let cancelInFlight = false;
  let pendingCancelRequestId: string | null = null;
  let nextCancelRequestId = 1;
  const emitted: Array<{event: string; payload: unknown}> = [];

  const socket = {
    emit(event: string, payload: unknown) {
      emitted.push({event, payload});
    },
  };

  const setActiveTask = (taskId: string | null) => {
    activeTaskId = taskId;
    if (taskId) {
      cancelBtn.classList.remove('hidden');
      if (!cancelInFlight) {
        cancelBtn.disabled = false;
      }
    } else {
      cancelBtn.classList.add('hidden');
      cancelBtn.disabled = false;
      cancelInFlight = false;
      pendingCancelRequestId = null;
    }
  };

  cancelBtn.addEventListener('click', () => {
    if (!activeTaskId || cancelBtn.disabled) return;
    const requestId = `cancel-req-${nextCancelRequestId++}`;
    cancelInFlight = true;
    pendingCancelRequestId = requestId;
    cancelBtn.disabled = true;
    socket.emit('cancel_task', {taskId: activeTaskId, id: requestId});
  });

  const handleAgentResponse = (event: AgentResponseEvent) => {
    if ('error' in event) {
      if (
        activeTaskId &&
        pendingCancelRequestId &&
        event.id === pendingCancelRequestId
      ) {
        cancelInFlight = false;
        pendingCancelRequestId = null;
        cancelBtn.disabled = false;
      }
      return;
    }

    const eventTaskId =
      event.taskId || (event.kind === 'task' ? event.id : null);
    const eventState = event.status?.state;
    const isTerminalTaskEvent =
      (!!eventState && TERMINAL_TASK_STATES.has(eventState)) ||
      (event.kind === 'status-update' && event.final === true);
    if (eventTaskId) {
      if (isTerminalTaskEvent) {
        if (eventTaskId === activeTaskId) {
          setActiveTask(null);
        }
      } else if (
        !activeTaskId ||
        eventTaskId === activeTaskId ||
        event.kind === 'task'
      ) {
        setActiveTask(eventTaskId);
      }
    }
  };

  return {
    cancelBtn,
    emitted,
    handleAgentResponse,
    getActiveTaskId: () => activeTaskId,
    getPendingCancelRequestId: () => pendingCancelRequestId,
    resetSession: () => setActiveTask(null),
  };
}

describe('Cancel Task Button', () => {
  let harness: ReturnType<typeof setupCancelHarness>;

  beforeEach(() => {
    harness = setupCancelHarness();
  });

  it('is hidden initially', () => {
    expect(harness.cancelBtn.classList.contains('hidden')).toBe(true);
  });

  it('becomes visible when a task event with an id arrives', () => {
    harness.handleAgentResponse({
      kind: 'task',
      id: 'task-123',
      status: {state: 'working'},
    });

    expect(harness.cancelBtn.classList.contains('hidden')).toBe(false);
    expect(harness.cancelBtn.disabled).toBe(false);
  });

  it('becomes visible on a status-update carrying a taskId', () => {
    harness.handleAgentResponse({
      kind: 'status-update',
      id: 'evt-1',
      taskId: 'task-456',
      status: {state: 'working'},
    });

    expect(harness.cancelBtn.classList.contains('hidden')).toBe(false);
  });

  it('emits cancel_task with the current taskId when clicked', () => {
    harness.handleAgentResponse({
      kind: 'task',
      id: 'task-abc',
      status: {state: 'working'},
    });

    fireEvent.click(harness.cancelBtn);

    expect(harness.emitted).toHaveLength(1);
    expect(harness.emitted[0].event).toBe('cancel_task');
    expect(harness.emitted[0].payload).toMatchObject({taskId: 'task-abc'});
  });

  it('disables the button while a cancel is in flight', () => {
    harness.handleAgentResponse({
      kind: 'task',
      id: 'task-abc',
      status: {state: 'working'},
    });
    fireEvent.click(harness.cancelBtn);

    expect(harness.cancelBtn.disabled).toBe(true);
  });

  it('does not emit a second cancel when clicked again while pending', () => {
    harness.handleAgentResponse({
      kind: 'task',
      id: 'task-abc',
      status: {state: 'working'},
    });
    fireEvent.click(harness.cancelBtn);
    fireEvent.click(harness.cancelBtn);

    expect(harness.emitted).toHaveLength(1);
  });

  it('does not re-enable Cancel on a streaming update while cancel is pending', () => {
    harness.handleAgentResponse({
      kind: 'task',
      id: 'task-abc',
      status: {state: 'working'},
    });
    fireEvent.click(harness.cancelBtn);

    harness.handleAgentResponse({
      kind: 'status-update',
      id: 'evt-2',
      taskId: 'task-abc',
      status: {state: 'working'},
    });

    expect(harness.cancelBtn.disabled).toBe(true);
  });

  it('keeps activeTaskId and re-enables the button on a matching cancel error', () => {
    harness.handleAgentResponse({
      kind: 'task',
      id: 'task-abc',
      status: {state: 'working'},
    });
    fireEvent.click(harness.cancelBtn);
    const cancelReqId = harness.getPendingCancelRequestId();

    harness.handleAgentResponse({
      id: cancelReqId!,
      error: 'Agent does not support cancel',
    });

    expect(harness.getActiveTaskId()).toBe('task-abc');
    expect(harness.cancelBtn.disabled).toBe(false);
    expect(harness.cancelBtn.classList.contains('hidden')).toBe(false);
    expect(harness.getPendingCancelRequestId()).toBe(null);
  });

  it('allows retry after a failed cancel', () => {
    harness.handleAgentResponse({
      kind: 'task',
      id: 'task-abc',
      status: {state: 'working'},
    });
    fireEvent.click(harness.cancelBtn);
    const cancelReqId = harness.getPendingCancelRequestId();
    harness.handleAgentResponse({
      id: cancelReqId!,
      error: 'Transient failure',
    });

    fireEvent.click(harness.cancelBtn);

    expect(harness.emitted).toHaveLength(2);
    expect(harness.emitted[1].event).toBe('cancel_task');
  });

  it('ignores unrelated error responses while cancel is pending', () => {
    harness.handleAgentResponse({
      kind: 'task',
      id: 'task-abc',
      status: {state: 'working'},
    });
    fireEvent.click(harness.cancelBtn);

    harness.handleAgentResponse({
      id: 'some-other-send-message-id',
      error: 'send_message failed for a different request',
    });

    // cancel state stays in-flight — button remains disabled, no retry allowed
    expect(harness.cancelBtn.disabled).toBe(true);
    expect(harness.getPendingCancelRequestId()).not.toBe(null);
    fireEvent.click(harness.cancelBtn);
    expect(harness.emitted).toHaveLength(1);
  });

  it('hides Cancel when the task reaches a terminal state', () => {
    harness.handleAgentResponse({
      kind: 'task',
      id: 'task-abc',
      status: {state: 'working'},
    });

    harness.handleAgentResponse({
      kind: 'status-update',
      id: 'evt-final',
      taskId: 'task-abc',
      status: {state: 'completed'},
    });

    expect(harness.cancelBtn.classList.contains('hidden')).toBe(true);
    expect(harness.getActiveTaskId()).toBe(null);
  });

  it('hides Cancel on a canceled terminal state', () => {
    harness.handleAgentResponse({
      kind: 'task',
      id: 'task-abc',
      status: {state: 'working'},
    });

    harness.handleAgentResponse({
      kind: 'task',
      id: 'task-abc',
      status: {state: 'canceled'},
    });

    expect(harness.cancelBtn.classList.contains('hidden')).toBe(true);
  });

  it('hides Cancel on a status-update with final: true', () => {
    harness.handleAgentResponse({
      kind: 'task',
      id: 'task-abc',
      status: {state: 'working'},
    });

    harness.handleAgentResponse({
      kind: 'status-update',
      id: 'evt-final',
      taskId: 'task-abc',
      final: true,
      status: {state: 'working'},
    });

    expect(harness.cancelBtn.classList.contains('hidden')).toBe(true);
    expect(harness.getActiveTaskId()).toBe(null);
  });

  it('hides Cancel on session reset', () => {
    harness.handleAgentResponse({
      kind: 'task',
      id: 'task-abc',
      status: {state: 'working'},
    });

    harness.resetSession();

    expect(harness.cancelBtn.classList.contains('hidden')).toBe(true);
    expect(harness.getActiveTaskId()).toBe(null);
  });

  it('ignores a late terminal update for an older task', () => {
    harness.handleAgentResponse({
      kind: 'task',
      id: 'task-current',
      status: {state: 'working'},
    });

    // A delayed terminal event arrives for a different, previous task.
    harness.handleAgentResponse({
      kind: 'status-update',
      id: 'evt-late',
      taskId: 'task-old',
      final: true,
      status: {state: 'completed'},
    });

    expect(harness.getActiveTaskId()).toBe('task-current');
    expect(harness.cancelBtn.classList.contains('hidden')).toBe(false);
  });

  it('ignores a non-terminal status-update for an unrelated task while one is active', () => {
    harness.handleAgentResponse({
      kind: 'task',
      id: 'task-current',
      status: {state: 'working'},
    });

    harness.handleAgentResponse({
      kind: 'status-update',
      id: 'evt-other',
      taskId: 'task-other',
      status: {state: 'working'},
    });

    expect(harness.getActiveTaskId()).toBe('task-current');
  });

  it('switches to a new active task when a fresh `task` event arrives', () => {
    harness.handleAgentResponse({
      kind: 'task',
      id: 'task-first',
      status: {state: 'working'},
    });

    harness.handleAgentResponse({
      kind: 'task',
      id: 'task-second',
      status: {state: 'working'},
    });

    expect(harness.getActiveTaskId()).toBe('task-second');
  });
});
