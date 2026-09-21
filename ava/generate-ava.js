// Generates Mit's icons & avatars from js/neko.js using macOS JavaScriptCore.
// Usage (from the maneki-neko folder):  osascript -l JavaScript ava/generate-ava.js "$PWD"
ObjC.import('Foundation');

function read(path) {
  return $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null).js;
}
function write(path, text) {
  $(text).writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null);
}

function run(argv) {
  const root = argv[0] || $.NSFileManager.defaultManager.currentDirectoryPath.js;
  (0, eval)(read(root + '/js/neko.js'));
  const N = globalThis.Neko;
  const out = root + '/ava/';
  const files = [];
  const save = (name, svg) => { write(out + name, svg); files.push(name); };

  // App icons
  save('app-icon.svg', N.icon({ size: 512 }));
  save('app-icon-maskable.svg', N.icon({ size: 512, maskable: true }));
  save('app-icon-gold.svg', N.icon({ size: 512, iconBg: '#F0A92B', gold: '#FFF1C2' }));
  save('favicon.svg', N.svg({ pose: 'head', mood: 'normal', bg: '#F6C453', size: 64 }));

  // Full-body maneki poses
  ['normal', 'happy', 'wink', 'sleepy', 'worried', 'surprised'].forEach((mood) => {
    save('mit-maneki' + (mood === 'normal' ? '' : '-' + mood) + '.svg', N.svg({ pose: 'maneki', mood, size: 400 }));
  });

  // Round avatars
  ['normal', 'happy', 'sleepy', 'worried'].forEach((mood) => {
    save('mit-avatar' + (mood === 'normal' ? '' : '-' + mood) + '.svg', N.svg({ pose: 'head', mood, bg: '#FFF1D0', size: 256 }));
  });

  save('koban.svg', N.coin(96));

  // Examples of the pet-theme generator (what the Pet Studio produces)
  save('example-shiba.svg', N.svg({ name: 'Shiba', species: 'dog', ears: 'floppy', pattern: 'bicolor', fur: '#D98A3D', furLight: '#FFF4E6', stripe: '#9A5A22', eye: '#5B3A1E', nose: '#2E2624', earInner: '#F2C4A8', mood: 'happy', size: 400 }));
  save('example-bunny.svg', N.svg({ name: 'Bun', species: 'rabbit', ears: 'long', pattern: 'solid', fur: '#F2EDE8', furLight: '#FFFFFF', stripe: '#C9BDB3', eye: '#7A3B3B', nose: '#F29AAE', earInner: '#F7C3CF', mood: 'normal', size: 400 }));
  save('example-blackcat.svg', N.svg({ name: 'Kuro', species: 'cat', ears: 'pointy', pattern: 'solid', fur: '#35302F', furLight: '#4A4443', stripe: '#1E1A19', eye: '#E6B422', nose: '#3B2E2E', earInner: '#8E6A6A', mood: 'wink', size: 400 }));

  return 'Wrote ' + files.length + ' files:\n' + files.join('\n');
}
