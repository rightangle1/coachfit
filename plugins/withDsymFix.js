const { withPodfile } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

/**
 * Forces `DEBUG_INFORMATION_FORMAT = dwarf-with-dsym` on every CocoaPods
 * target's Release config, patched into the generated (gitignored, CNG)
 * `ios/Podfile` on every prebuild.
 *
 * Without this, some source-built pods (seen with ExpoImage and the
 * SDWebImage coders) don't emit a dSYM into the archive even though the
 * aggregate Pods project's own Release config already sets dwarf-with-dsym —
 * per-pod `pod_target_xcconfig` in their podspecs can win over that. Xcode
 * Organizer then reports "Upload Symbols Failed" for those frameworks.
 *
 * Does NOT fix warnings for React.framework / ReactNativeDependencies.framework
 * / hermesvm.framework — those ship as precompiled xcframeworks with no dSYM
 * bundled inside for this react-native version, so there's nothing to
 * generate; that's a Meta-side prebuilt-artifact gap, not a project setting.
 */
function withDsymFix(config) {
  return withPodfile(config, (config) => {
    config.modResults.contents = mergeContents({
      src: config.modResults.contents,
      newSrc: [
        '  installer.pods_project.targets.each do |target|',
        '    target.build_configurations.each do |build_config|',
        "      next unless build_config.name == 'Release'",
        "      build_config.build_settings['DEBUG_INFORMATION_FORMAT'] = 'dwarf-with-dsym'",
        '    end',
        '  end',
      ].join('\n'),
      tag: 'dsym-fix',
      anchor: /^\s*post_install do \|installer\|$/,
      offset: 1,
      comment: '#',
    }).contents;
    return config;
  });
}

module.exports = withDsymFix;
