/**
 * Privacy Policy content — single source of truth rendered by `PrivacySheet`
 * (onboarding + Settings) and referenced when recording acceptance on the
 * athlete profile (`privacyAcceptedAt`/`privacyVersion`). Mirrors the
 * structure of `app-lib/terms.ts`.
 *
 * Kept in sync with the public copy on the marketing site's Privacy Policy
 * page. If you change the substance here, update that page too (and vice
 * versa) — see docs/release for the site source.
 */

/** Bump whenever the substance of the policy changes, so a future re-prompt
 * ("privacy policy updated, please re-accept") can compare against `privacyVersion`. */
export const PRIVACY_VERSION = '2026-08-07';

export interface PrivacySection {
  title: string;
  body: string;
}

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    title: 'Who we are',
    body:
      'CoachFit is developed and maintained by Bright Angle, LLC, a Maryland limited ' +
      'liability company ("we," "us," "Bright Angle"). This policy explains what ' +
      'information the app handles and how.',
  },
  {
    title: 'The short version',
    body:
      'CoachFit keeps your data on your device. There\'s no account, no ads, and no ' +
      'third-party analytics or tracking. The only data that ever leaves your device is ' +
      'what you choose to write to Apple Health.',
  },
  {
    title: 'What CoachFit stores, and where',
    body:
      'Your goals, experience level, and constraints; your equipment; daily check-in ' +
      'answers (sleep, energy, soreness, anything bothering you, target/avoid areas); and ' +
      'your workout history (sets, reps, weight, RPE, debrief notes) are stored only in a ' +
      'local database on your device. None of it is sent to us or to any server — we don\'t ' +
      'operate one. None of it requires a name, email, or account of any kind.',
  },
  {
    title: 'Apple Health',
    body:
      'If you turn it on, CoachFit writes your completed workouts to Apple Health. This is ' +
      'write-only: CoachFit asks iOS for permission to share data with Health, and never ' +
      'asks for permission to read anything back from Health or from other apps connected ' +
      'to it. You can review or revoke this any time in iOS Settings → Privacy & Security → ' +
      'Health → CoachFit.',
  },
  {
    title: 'What CoachFit doesn\'t do',
    body:
      'No accounts or sign-in. No cloud sync today (a future opt-in sync feature would come ' +
      'with an updated policy before it ships). No ads. No third-party analytics, crash ' +
      'reporting, or tracking libraries. No selling, renting, or sharing your data with ' +
      'anyone — we don\'t have it to share.',
  },
  {
    title: 'Notifications',
    body:
      'Reminders and rest-timer alerts are scheduled locally on your device. They don\'t ' +
      'involve a push notification service or any transmission of data off your device.',
  },
  {
    title: 'Your data, your control',
    body:
      'Deleting CoachFit from your device permanently deletes its local data with it. If ' +
      'you\'ve enabled Apple Health write-back, workouts already saved to Health stay there ' +
      'under Apple\'s own controls — manage or delete that data from the Health app.',
  },
  {
    title: 'Children\'s privacy',
    body:
      'CoachFit isn\'t directed at children and isn\'t intended for use by anyone under 13. ' +
      'We don\'t knowingly collect information from children — and since the app has no ' +
      'accounts or data transmission, no data is collected in the first place.',
  },
  {
    title: 'Changes to this policy',
    body:
      'If this policy changes — for example, if an optional cloud sync feature is ' +
      'introduced — we\'ll update it and note the new version here. Material changes to how ' +
      'your data is handled will be called out clearly before you\'re asked to opt in.',
  },
];
