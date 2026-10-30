import { describe, it, expect } from "@jest/globals";
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme';
import { Row } from '../Parts';

describe('Earn row accessible summaries', () => {
  it('names an actionable draft with its readiness and timing', async () => {
    await render(<ThemeProvider><Row label="Restock the van" detail="Your AI · Each day · 20 minutes · Ready to hand off" onPress={() => {}} /></ThemeProvider>);
    expect(screen.getByRole('button', { name: 'Restock the van. Your AI · Each day · 20 minutes · Ready to hand off' })).toBeTruthy();
  });
  it('exposes static team counts as text, without a disabled button', async () => {
    await render(<ThemeProvider><Row label="Dana Reed" detail="2 cards · 1 fixes" /></ThemeProvider>);
    expect(screen.getByRole('text', { name: 'Dana Reed. 2 cards · 1 fixes' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
