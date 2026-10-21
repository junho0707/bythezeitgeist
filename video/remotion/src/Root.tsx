import React from 'react';
import {Composition} from 'remotion';
import {Zeitgeist, ZeitgeistCover, zeitgeistSchema, zeitgeistDuration, type ZeitgeistProps} from './Zeitgeist';

/**
 * Studio previews a sample episode; renders pass each episode's props.json
 * (written by pipeline/build.mjs) via --props.
 */
import zeitgeistProps from '../public/sample-props.json';

const CANVAS = {width: 1080, height: 1920, fps: 30};

export const RemotionRoot: React.FC = () => (
  <>
    {/* The news Short: morning / midday / evening / weekly / monthly. */}
    <Composition
      id="Zeitgeist"
      component={Zeitgeist}
      schema={zeitgeistSchema}
      defaultProps={zeitgeistProps as ZeitgeistProps}
      width={CANVAS.width}
      height={CANVAS.height}
      fps={CANVAS.fps}
      durationInFrames={1}
      calculateMetadata={({props: p}) => ({durationInFrames: zeitgeistDuration(p, CANVAS.fps)})}
    />
    {/* Its cover / thumbnail: edition, date and the five stories. */}
    <Composition
      id="ZeitgeistCover"
      component={ZeitgeistCover}
      schema={zeitgeistSchema}
      defaultProps={zeitgeistProps as ZeitgeistProps}
      width={CANVAS.width}
      height={CANVAS.height}
      fps={CANVAS.fps}
      durationInFrames={1}
    />
  </>
);
