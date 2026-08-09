const { withAppDelegate } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

/**
 * Ends the workout Live Activity from `applicationWillTerminate`, patched into
 * the generated (gitignored, CNG) `AppDelegate.swift` on every prebuild.
 *
 * Best-effort, not guaranteed: iOS does not call `applicationWillTerminate` for
 * every user-initiated force-quit — a suspended app killed from the app
 * switcher is SIGKILLed with no callback at all (see ADR-0401's note on the
 * terminated-process case). This still beats leaving the activity to expire on
 * its own for the terminations iOS does hand back to the app.
 *
 * Relies on `expoWidgetsEndAllLiveActivities()`, a public function patched into
 * `expo-widgets` (see patches/expo-widgets+*.patch) — `LiveActivityAttributes`
 * is internal to that pod's module, so the host app can't call
 * `Activity<T>.end` directly.
 */
function withLiveActivityTermination(config) {
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      throw new Error('withLiveActivityTermination expects a Swift AppDelegate.');
    }

    let contents = config.modResults.contents;

    contents = mergeContents({
      src: contents,
      // Must match the access level Expo's own generated code uses to import
      // this pod (`ExpoModulesProvider.swift`) — Swift errors on "ambiguous
      // implicit access level" if a plain `import` and an `internal import`
      // of the same module coexist in one target.
      newSrc: 'internal import ExpoWidgets',
      tag: 'live-activity-termination-import',
      anchor: /^internal import Expo$/,
      offset: 1,
      comment: '//',
    }).contents;

    contents = mergeContents({
      src: contents,
      newSrc: [
        '  public override func applicationWillTerminate(_ application: UIApplication) {',
        '    expoWidgetsEndAllLiveActivities()',
        '    super.applicationWillTerminate(application)',
        '  }',
      ].join('\n'),
      tag: 'live-activity-termination',
      anchor: /^class AppDelegate: ExpoAppDelegate \{$/,
      offset: 1,
      comment: '//',
    }).contents;

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withLiveActivityTermination;
