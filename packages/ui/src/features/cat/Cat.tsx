import React from 'react';
import { cn } from '@/lib';
import { catConfig } from './cat.config';
import { TCatFace, TCatFur, TCatHand, TCatHat } from './types';

export const Cat = React.forwardRef<TCatRef, TCatProps>((props, ref) => {
	const {
		fur = 'white',
		face = 'cute',
		hat,
		size = 150,
		position = 'edge',
		className,
		onTap
	} = props;
	const [leftHandPose, setLeftHandPose] = React.useState<TCatHand>('up');
	const [rightHandPose, setRightHandPose] = React.useState<TCatHand>('up');
	const lastTappedHandRef = React.useRef<'left' | 'right'>('right');
	const cooldownUntilRef = React.useRef(0);

	const bottomOffset =
		position === 'edge' ? catConfig.baseBodyBottomOffset * (size / catConfig.baseSize) : 0;
	const containerHeight = size - bottomOffset;

	// MARK: - Actions

	const tap = React.useCallback((options: TTapOptions = {}) => {
		const {
			mode = lastTappedHandRef.current === 'right' ? 'left' : 'right',
			cooldown = catConfig.tapThrottleMs
		} = options;

		if (cooldown !== 0 && Date.now() < cooldownUntilRef.current) {
			return;
		}

		if (mode === 'left' || mode === 'both') {
			setLeftHandPose('down');
			setTimeout(() => setLeftHandPose('up'), 100);
		}
		if (mode === 'right' || mode === 'both') {
			setRightHandPose('down');
			setTimeout(() => setRightHandPose('up'), 100);
		}
		if (mode !== 'both') {
			lastTappedHandRef.current = mode;
		}

		cooldownUntilRef.current = Date.now() + cooldown;
	}, []);

	const handleTap = React.useCallback(() => {
		tap({ ...(onTap?.() ?? {}), cooldown: 0 });
	}, [tap, onTap]);

	// MARK: - Effects

	React.useImperativeHandle(ref, () => ({ tap }), [tap]);

	// MARK: - UI

	return (
		<div
			className={cn('pointer-events-none relative', className)}
			style={{ width: size, height: containerHeight }}
		>
			{/* Tap target */}
			<div className="pointer-events-auto absolute inset-0" onPointerDown={handleTap} />
			{/* Cat layers */}
			<div
				className="pointer-events-none absolute bottom-0 left-0"
				style={{
					width: size,
					height: size,
					transform: `translateY(${bottomOffset}px)`
				}}
			>
				<img
					src={catConfig.parts.fur.path.base(fur)}
					alt=""
					draggable={false}
					className="absolute inset-0 h-full w-full select-none"
				/>
				{/* Note: Keep both paw poses mounted to avoid image requests during taps */}
				{catConfig.parts.hand.available.map((pose) => (
					<img
						key={pose}
						src={catConfig.parts.fur.path.leftHand(fur, pose)}
						alt=""
						draggable={false}
						className={cn(
							'absolute inset-0 h-full w-full select-none',
							pose !== leftHandPose && 'invisible'
						)}
					/>
				))}
				<img
					src={catConfig.parts.face.path(face)}
					alt=""
					draggable={false}
					className="absolute inset-0 h-full w-full select-none"
				/>
				{hat != null && (
					<img
						src={catConfig.parts.hat.path(hat)}
						alt=""
						draggable={false}
						className="absolute inset-0 h-full w-full select-none"
					/>
				)}
				{/* Note: Keep both paw poses mounted to avoid image requests during taps */}
				{catConfig.parts.hand.available.map((pose) => (
					<img
						key={pose}
						src={catConfig.parts.fur.path.rightHand(fur, pose)}
						alt=""
						draggable={false}
						className={cn(
							'absolute inset-0 h-full w-full select-none',
							pose !== rightHandPose && 'invisible'
						)}
					/>
				))}
			</div>
		</div>
	);
});
Cat.displayName = 'Cat';

interface TCatProps {
	fur?: TCatFur;
	face?: TCatFace;
	hat?: TCatHat | null;
	size?: number;
	position?: 'edge' | 'centered';
	className?: string;
	onTap?: (() => TTapOptions) | (() => void);
}

export interface TCatRef {
	tap: (options?: TTapOptions) => void;
}

export type TCatTapMode = 'left' | 'right' | 'both';

export interface TTapOptions {
	mode?: TCatTapMode;
	cooldown?: number;
}
