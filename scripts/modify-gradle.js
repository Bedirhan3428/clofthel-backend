const fs = require('fs');
const path = require('path');

const gradlePath = path.join(__dirname, '../android/app/build.gradle');

if (!fs.existsSync(gradlePath)) {
  console.error('[Modify Gradle] android/app/build.gradle not found!');
  process.exit(1);
}

let content = fs.readFileSync(gradlePath, 'utf8');

// 1. Add enableSeparateBuildPerCPUArchitecture definition
if (!content.includes('def enableSeparateBuildPerCPUArchitecture')) {
  content = content.replace(
    'apply plugin: "com.facebook.react"',
    'apply plugin: "com.facebook.react"\n\ndef enableSeparateBuildPerCPUArchitecture = false'
  );
} else {
  content = content.replace(
    'def enableSeparateBuildPerCPUArchitecture = true',
    'def enableSeparateBuildPerCPUArchitecture = false'
  );
}


// 3. Add splits and applicationVariants configuration
if (!content.includes('splits {')) {
  const target = `    androidResources {
        ignoreAssetsPattern '!.svn:!.git:!.ds_store:!*.scc:!CVS:!thumbs.db:!picasa.ini:!*~'
    }`;
  
  const replacement = `${target}

    splits {
        abi {
            reset()
            enable enableSeparateBuildPerCPUArchitecture
            universalApk false
            include "armeabi-v7a", "x86", "arm64-v8a", "x86_64"
        }
    }

    // Application Variants configuration to map APK names with split architecture
    applicationVariants.all { variant ->
        variant.outputs.each { output ->
            def versionCodes = ["armeabi-v7a": 1, "x86": 2, "arm64-v8a": 3, "x86_64": 4]
            def abi = output.getFilter("ABI")
            if (abi != null) {  // null for the universal-debug, universal-release variants
                output.versionCodeOverride =
                        defaultConfig.versionCode * 1000 + versionCodes.get(abi)
            }
        }
    }`;

  content = content.replace(target, replacement);
}

fs.writeFileSync(gradlePath, content, 'utf8');
console.log('[Modify Gradle] Successfully modified android/app/build.gradle');
