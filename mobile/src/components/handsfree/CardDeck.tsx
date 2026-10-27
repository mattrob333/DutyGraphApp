import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, PanResponder, View, type LayoutChangeEvent } from 'react-native';
import { nativeDriver, slideEasing } from './anim';

export interface CardDeckProps {
  count: number;
  /** The card on screen. */
  shown: number;
  renderCard: (index: number) => React.ReactNode;
  reduce?: boolean;
  /** Swipe right: the previous card. */
  onSwipeBack?: () => void;
  /** Swipe left while looking at a past card: the next one. */
  onSwipeForward?: () => void;
  height?: number;
}

/** Card width is the deck width less the 20 px gutter and 34 px for the next card's peek. */
const GUTTER = 20;
const PEEK_SPACE = 34;
const SLIDE_MS = 620;
/** Room above and below the cards for the Checking glow (it sits 5.5 px outside the card). */
const INSET = 6;

/**
 * The stack of question cards (hf-05 … hf-18). The next card peeks in on the right. On advance the
 * current card slides left with a slight tilt and the next springs in (the prototype's
 * cubic-bezier(.3, 1.22, .4, 1)); going back reverses it. With reduced motion the cards cross-fade
 * in place. Only the card on screen is reachable by touch and by screen readers. `height` is the
 * card's height; the deck adds a few pixels above and below for the Checking glow.
 */
export function CardDeck({ count, shown, renderCard, reduce, onSwipeBack, onSwipeForward, height = 352 }: CardDeckProps) {
  // The window width until the first layout (the deck spans the screen).
  const [width, setWidth] = useState(() => Dimensions.get('window').width || 390);
  const cardW = Math.max(0, width - GUTTER - PEEK_SPACE);
  const pos = useRef<Animated.Value[]>([]).current;
  for (let i = pos.length; i < count; i++) pos.push(new Animated.Value(i - shown));
  const fade = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  // Reduced motion: the card that just left fades out while the new one fades in (1 - fade).
  const last = useRef(shown);
  const leaving = useRef<number | null>(null);
  if (last.current !== shown) {
    leaving.current = last.current;
    last.current = shown;
    if (reduce) fade.setValue(0);
  }

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) {
      pos.forEach((v, i) => v.setValue(i - shown));
      fade.setValue(0);
      const a = Animated.timing(fade, { toValue: 1, duration: 350, easing: Easing.ease, useNativeDriver: nativeDriver });
      a.start();
      return () => a.stop();
    }
    const a = Animated.parallel(pos.map((v, i) => Animated.timing(v, { toValue: i - shown, duration: SLIDE_MS, easing: slideEasing, useNativeDriver: nativeDriver })));
    a.start();
    return () => a.stop();
  }, [shown, reduce, pos, fade]);

  const swipe = useRef({ back: onSwipeBack, fwd: onSwipeForward });
  swipe.current = { back: onSwipeBack, fwd: onSwipeForward };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_e, g) => {
          if (g.dx > 50) swipe.current.back?.();
          else if (g.dx < -50) swipe.current.fwd?.();
        },
      }),
    [],
  );

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View onLayout={onLayout} style={{ height: height + 2 * INSET, overflow: 'hidden' }} {...pan.panHandlers}>
      {width > 0
        ? Array.from({ length: count }, (_, i) => {
            const rel = i - shown;
            if (rel < -1 || rel > 2) return null;
            const p = pos[i];
            const translateX = p.interpolate({
              inputRange: [-1, 0, 1, 2],
              outputRange: [reduce ? 0 : -1.18 * cardW, 0, cardW + 20, 2 * cardW + 40],
              extrapolate: 'clamp',
            });
            const rotate = p.interpolate({ inputRange: [-1, 0, 1], outputRange: [reduce ? '0deg' : '-7deg', '0deg', '0deg'], extrapolate: 'clamp' });
            const opacity = p.interpolate({ inputRange: [-1, 0, 1, 2], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' });
            const fadingOut = reduce && rel === -1 && leaving.current === i;
            return (
              <Animated.View
                key={i}
                pointerEvents={rel === 0 ? 'box-none' : 'none'}
                aria-hidden={rel !== 0}
                accessibilityElementsHidden={rel !== 0}
                importantForAccessibility={rel === 0 ? 'auto' : 'no-hide-descendants'}
                style={{
                  position: 'absolute',
                  top: INSET,
                  left: GUTTER,
                  width: cardW,
                  height,
                  zIndex: rel === 0 ? 3 : rel === 1 ? 2 : 1,
                  opacity: rel === 0 && reduce ? fade : fadingOut ? fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) : opacity,
                  transformOrigin: '30% 100%',
                  transform: [{ translateX }, { rotate }],
                }}
              >
                {renderCard(i)}
              </Animated.View>
            );
          })
        : null}
    </View>
  );
}
