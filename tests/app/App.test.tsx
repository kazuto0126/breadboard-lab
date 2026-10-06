// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';

afterEach(cleanup);

describe('App', () => {
  it('shows the product name', () => {
    render(<App />);
    expect(screen.getByText('breadboard-lab')).toBeTruthy();
  });
});
