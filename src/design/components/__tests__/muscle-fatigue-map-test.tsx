import { fireEvent, render } from '@testing-library/react-native';

import { ThemeProvider } from '../../theme';
import { MuscleFatigueMap } from '../muscle-fatigue-map';

describe('MuscleFatigueMap', () => {
  it('switches views and exposes each muscle status to assistive technology', async () => {
    const onSelect = jest.fn();
    const screen = await render(
      <ThemeProvider>
        <MuscleFatigueMap fatigue={{ byGroup: { chest: 0.75 }, updatedAt: 0 }} onSelect={onSelect} />
      </ThemeProvider>,
    );
    expect(screen.getAllByLabelText('Chest: fatigued')).toHaveLength(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('back body fatigue map')).toBeTruthy();
  });
});
