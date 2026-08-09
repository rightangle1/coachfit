import { fireEvent, render } from '@testing-library/react-native';

import { ThemeProvider } from '../../theme';
import { ActionRow, ChoiceTile, Chip } from '../controls';
import { Button, IconButton } from '../button';

describe('Editorial Athlete controls', () => {
  it('exposes each action level and a busy primary action accessibly', async () => {
    const screen = await render(
      <ThemeProvider>
        <Button title="Save workout" loading />
        <Button title="Add set" variant="secondary" />
        <Button title="Cancel" variant="quiet" />
        <Button title="Remove exercise" variant="danger" />
      </ThemeProvider>,
    );

    expect(screen.getByRole('button', { name: 'Save workout' }).props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    expect(screen.getByRole('button', { name: 'Add set' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove exercise' })).toBeTruthy();
  });

  it('keeps selections and icon actions operable', async () => {
    const onChoice = jest.fn();
    const onRow = jest.fn();
    const onIcon = jest.fn();
    const screen = await render(
      <ThemeProvider>
        <Chip label="Warmup" selected />
        <ChoiceTile label="Balanced" selected onPress={onChoice} />
        <ActionRow label="Edit equipment" onPress={onRow} />
        <IconButton label="Close" icon={null} onPress={onIcon} />
      </ThemeProvider>,
    );

    expect(screen.getByRole('button', { name: 'Warmup' }).props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Balanced' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Edit equipment' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onChoice).toHaveBeenCalledTimes(1);
    expect(onRow).toHaveBeenCalledTimes(1);
    expect(onIcon).toHaveBeenCalledTimes(1);
  });
});
