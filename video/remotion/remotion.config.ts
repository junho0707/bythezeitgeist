import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setCodec('h264');
Config.setCrf(16);
Config.setChromiumDisableWebSecurity(true);
Config.setEntryPoint('./src/index.ts');
