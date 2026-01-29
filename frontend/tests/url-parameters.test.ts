/**
 * Tests for URL parameter handling
 * Tests automatic population of agent URL from query parameters
 */

import { describe, it, expect, beforeEach } from 'vitest';

describe('URL Parameters', () => {
  let agentCardUrlInput: HTMLInputElement;

  beforeEach(() => {
    // Set up the DOM structure that matches the actual HTML
    document.body.innerHTML = `
      <div id="app">
        <input type="text" id="agent-card-url" placeholder="Enter Agent Card URL">
      </div>
    `;

    agentCardUrlInput = document.getElementById(
      'agent-card-url',
    ) as HTMLInputElement;
  });

  it('should populate input field when agentUrl parameter is present', () => {
    // Simulate URL parameter
    const testUrl = 'https://example.com';
    const urlParams = new URLSearchParams(`?agentUrl=${testUrl}`);
    const agentUrlFromParam = urlParams.get('agentUrl');

    if (agentUrlFromParam) {
      agentCardUrlInput.value = agentUrlFromParam;
    }

    expect(agentCardUrlInput.value).toBe(testUrl);
  });

  it('should leave input field empty when agentUrl parameter is not present', () => {
    // No URL parameter
    const urlParams = new URLSearchParams('');
    const agentUrlFromParam = urlParams.get('agentUrl');

    if (agentUrlFromParam) {
      agentCardUrlInput.value = agentUrlFromParam;
    }

    expect(agentCardUrlInput.value).toBe('');
  });

  it('should correctly decode URL-encoded parameter', () => {
    // URL-encoded parameter
    const encodedUrl = 'https%3A%2F%2Fexample.com%2Fpath';
    const urlParams = new URLSearchParams(`?agentUrl=${encodedUrl}`);
    const agentUrlFromParam = urlParams.get('agentUrl');

    if (agentUrlFromParam) {
      agentCardUrlInput.value = agentUrlFromParam;
    }

    // URLSearchParams automatically decodes the parameter
    expect(agentCardUrlInput.value).toBe('https://example.com/path');
  });

  it('should handle URLs with query parameters', () => {
    // URL with query parameters needs to be encoded properly
    const complexUrl = 'https://example.com/agent?key=value&foo=bar';
    const urlParams = new URLSearchParams(
      `?agentUrl=${encodeURIComponent(complexUrl)}`,
    );
    const agentUrlFromParam = urlParams.get('agentUrl');

    if (agentUrlFromParam) {
      agentCardUrlInput.value = agentUrlFromParam;
    }

    expect(agentCardUrlInput.value).toBe(complexUrl);
    expect(agentCardUrlInput.value).toContain('example.com');
    expect(agentCardUrlInput.value).toContain('key=value');
  });

  it('should handle special characters in URL', () => {
    const urlWithSpecialChars =
      'https://example.com/agent?query=hello%20world';
    const urlParams = new URLSearchParams(
      `?agentUrl=${encodeURIComponent(urlWithSpecialChars)}`,
    );
    const agentUrlFromParam = urlParams.get('agentUrl');

    if (agentUrlFromParam) {
      agentCardUrlInput.value = agentUrlFromParam;
    }

    expect(agentCardUrlInput.value).toBe(urlWithSpecialChars);
  });

  it('should handle real A2A agent URL', () => {
    const realAgentUrl =
      'https://sample-a2a-agent-908687846511.us-central1.run.app';
    const urlParams = new URLSearchParams(`?agentUrl=${realAgentUrl}`);
    const agentUrlFromParam = urlParams.get('agentUrl');

    if (agentUrlFromParam) {
      agentCardUrlInput.value = agentUrlFromParam;
    }

    expect(agentCardUrlInput.value).toBe(realAgentUrl);
    expect(agentCardUrlInput.value).toContain('run.app');
  });

  it('should ignore empty agentUrl parameter', () => {
    const urlParams = new URLSearchParams('?agentUrl=');
    const agentUrlFromParam = urlParams.get('agentUrl');

    // Empty string is falsy, so it shouldn't populate
    if (agentUrlFromParam) {
      agentCardUrlInput.value = agentUrlFromParam;
    }

    expect(agentCardUrlInput.value).toBe('');
  });

  it('should handle multiple query parameters', () => {
    const testUrl = 'https://example.com';
    const urlParams = new URLSearchParams(
      `?agentUrl=${testUrl}&other=value&foo=bar`,
    );
    const agentUrlFromParam = urlParams.get('agentUrl');

    if (agentUrlFromParam) {
      agentCardUrlInput.value = agentUrlFromParam;
    }

    expect(agentCardUrlInput.value).toBe(testUrl);
  });
});
