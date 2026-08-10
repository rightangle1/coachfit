import { View } from 'react-native';
import { render } from '@testing-library/react-native';

import { MUSCLE_GROUP_LABELS } from '@/app-lib/options';
import { ALL_MUSCLE_GROUPS } from '@/domain/types';
import { ThemeProvider } from '../../theme';
import { MuscleLogo } from '../muscle-logo';

describe('MuscleLogo', () => {
  it('renders a distinct accessible visual for every supported muscle group', async () => {
    const screen = await render(
      <ThemeProvider>
        <View>
          {ALL_MUSCLE_GROUPS.map((group) => <MuscleLogo key={group} groups={[group]} />)}
        </View>
      </ThemeProvider>,
    );

    for (const group of ALL_MUSCLE_GROUPS) {
      expect(screen.getByLabelText(`Muscle focus: ${MUSCLE_GROUP_LABELS[group]}`)).toBeTruthy();
    }
  });
});
