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

interface AgentResponseEvent {
  kind: 'task' | 'status-update' | 'artifact-update' | 'message';
  id: string;
  taskId?: string;
  error?: string;
  final?: boolean;
  status?: {state: string};
}

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
    }
  };

  cancelBtn.addEventListener('click', () => {
    if (!activeTaskId || cancelBtn.disabled) return;
    cancelInFlight = true;
    cancelBtn.disabled = true;
    socket.emit('cancel_task', {taskId: activeTaskId, id: 'cancel-req-1'});
  });

  const handleAgentResponse = (event: AgentResponseEvent) => {
    if (event.error) {
      if (activeTaskId) {
        cancelInFlight = false;
        cancelBtn.disabled = false;
      }
      return;
    }

    const eventTaskId =
      event.taskId || (event.kind === 'task' ? event.id : null);
    const eventState = event.status?.state;
    if (eventTaskId) {
      if (eventState && TERMINAL_TASK_STATES.has(eventState)) {
        setActiveTask(null);
      } else if (event.kind === 'status-update' && event.final) {
        setActiveTask(null);
      } else {
        setActiveTask(eventTaskId);
      }
    }
  };

  return {
    cancelBtn,
    emitted,
    handleAgentResponse,
    getActiveTaskId: () => activeTaskId,
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

  it('keeps activeTaskId and re-enables the button on error', () => {
    harness.handleAgentResponse({
      kind: 'task',
      id: 'task-abc',
      status: {state: 'working'},
    });
    fireEvent.click(harness.cancelBtn);

    harness.handleAgentResponse({
      kind: 'message',
      id: 'err-1',
      error: 'Agent does not support cancel',
    });

    expect(harness.getActiveTaskId()).toBe('task-abc');
    expect(harness.cancelBtn.disabled).toBe(false);
    expect(harness.cancelBtn.classList.contains('hidden')).toBe(false);
  });

  it('allows retry after a failed cancel', () => {
    harness.handleAgentResponse({
      kind: 'task',
      id: 'task-abc',
      status: {state: 'working'},
    });
    fireEvent.click(harness.cancelBtn);
    harness.handleAgentResponse({
      kind: 'message',
      id: 'err-1',
      error: 'Transient failure',
    });

    fireEvent.click(harness.cancelBtn);

    expect(harness.emitted).toHaveLength(2);
    expect(harness.emitted[1].event).toBe('cancel_task');
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
});
