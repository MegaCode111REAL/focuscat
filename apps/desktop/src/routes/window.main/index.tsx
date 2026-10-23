import {
	Cat,
	catConfig,
	HistoryIcon,
	IconButton,
	MinimizeIcon,
	SettingsIcon,
	ShuffleIcon,
	TCatFace,
	TCatHat,
	TimerView,
	type TCatRef
} from '@repo/ui';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { createFileRoute } from '@tanstack/react-router';
import { useFeatureState, useListener } from 'feature-react/state';
import React from 'react';
import { WindowHeader } from '@/components';
import { specta } from '@/environment';
import { useSettingsCx } from '@/features/settings';
import { useTimerViewCx } from '@/features/timer';
import { OverviewCard } from './components';

export const Route = createFileRoute('/window/main/')({
	component: RouteComponent
});

function RouteComponent() {
	const catRef = React.useRef<TCatRef>(null);
	const [isFullscreen, setIsFullscreen] = React.useState(false);

	React.useEffect(() => {
		const window = getCurrentWindow();
		let unlisten: (() => void) | undefined;
		let cancelled = false;

		void window.isFullscreen().then(setIsFullscreen).catch((error) => {
			console.error('FocusCat could not read fullscreen state:', error);
		});
		void window.onResized(() => {
			void window.isFullscreen().then(setIsFullscreen).catch((error) => {
				console.error('FocusCat could not read fullscreen state:', error);
			});
		}).then((stopListening) => {
			if (cancelled) stopListening();
			else unlisten = stopListening;
		}).catch((error) => {
			console.error('FocusCat could not listen for window resizing:', error);
		});

		return () => {
			cancelled = true;
			unlisten?.();
		};
	}, []);

	const settingsCx = useSettingsCx();
	const settings = useFeatureState(settingsCx.$appSettings);

	const timerViewCx = useTimerViewCx();
	const timerStatus = useFeatureState(timerViewCx.timer.$status);

	// Top section (Stats + Cat): width is half of 300px window, height lets cat overflow into timer wheel
	const topSection = React.useMemo(() => {
		const width = 150;
		const scaledBodyOffset = catConfig.baseBodyBottomOffset * (width / catConfig.baseSize);
		const height = Math.round(width - scaledBodyOffset);
		return { width, height };
	}, []);

	// MARK: - Actions

	const handleMinimize = React.useCallback(async () => {
		try {
			const shown = await specta.commands.showCatWindow();
			if (shown.status !== 'ok') {
				throw new Error(String(shown.error));
			}

			// Only hide the main window after the cat widget has actually opened.
			const hidden = await specta.commands.hideMainWindow();
			if (hidden.status !== 'ok') {
				throw new Error(String(hidden.error));
			}
		} catch (error) {
			console.error('FocusCat could not switch to the cat widget:', error);
		}
	}, []);

	const handleSettings = React.useCallback(async () => {
		try {
			const result = await specta.commands.showSettingsWindow();
			if (result.status !== 'ok') {
				throw new Error(String(result.error));
			}
		} catch (error) {
			console.error('FocusCat could not open Settings:', error);
		}
	}, []);

	const handleActivity = React.useCallback(async () => {
		try {
			const result = await specta.commands.showActivityWindow();
			if (result.status !== 'ok') {
				throw new Error(String(result.error));
			}
		} catch (error) {
			console.error('FocusCat could not open Activity:', error);
		}
	}, []);

	const handleRandomize = React.useCallback(() => {
		const faces: TCatFace[] = [...catConfig.parts.face.available];
		const hats: (TCatHat | null)[] = [...catConfig.parts.hat.available, null];
		const currentFace = settings.cat.equippedFace;
		const currentHat = settings.cat.equippedHat;

		// Choose from valid alternatives instead of retrying randomly in a loop.
		// This guarantees the UI thread cannot get stuck if there is only one
		// available combination.
		const alternatives = faces.flatMap((face) =>
			hats
				.filter((hat) => face !== currentFace || hat !== currentHat)
				.map((hat) => ({ face, hat }))
		);

		if (alternatives.length === 0) return;

		const next = alternatives[Math.floor(Math.random() * alternatives.length)];
		if (!next) return;

		settingsCx.update({
			cat: {
				equippedFur: settings.cat.equippedFur,
				equippedFace: next.face,
				equippedHat: next.hat
			}
		});
	}, [settingsCx, settings.cat]);

	const handleCatTap = React.useCallback(() => {
		specta.commands.playSound('meow');
		return timerStatus === 'running' ? { mode: 'both' as const } : undefined;
	}, [timerStatus]);

	// MARK: - Effects

	useListener(timerViewCx.$previewMinutes, ({ value: minutes, prevValue: prevMinutes }) => {
		if (minutes != null && Math.round(minutes) !== Math.round(prevMinutes ?? minutes + 1)) {
			catRef.current?.tap();
		}
	});

	useListener(timerViewCx.timer.$remainingSeconds, () => {
		if (
			timerViewCx.timer.$status.get() === 'running' &&
			timerViewCx.$previewMinutes.get() == null
		) {
			catRef.current?.tap();
		}
	});

	// MARK: - UI

	return (
		<div className={`bg-base-0 flex h-screen ${isFullscreen ? 'w-screen' : 'w-[300px]'} flex-col`}>
			<WindowHeader showWindowControls>
				{settings.features.catWindow && (
					<IconButton
						variant="bare"
						size="sm"
						onClick={handleMinimize}
						aria-label="Minimize to cat widget"
					>
						<MinimizeIcon className="size-4" />
					</IconButton>
				)}
				<div className="flex-1" />
				{settings.features.activity && (
					<IconButton variant="bare" size="sm" onClick={handleActivity} aria-label="View activity">
						<HistoryIcon className="size-4" />
					</IconButton>
				)}
				<IconButton variant="bare" size="sm" onClick={handleSettings} aria-label="Open settings">
					<SettingsIcon className="size-4" />
				</IconButton>
			</WindowHeader>

			{/* Top section: Overview + Cat */}
			<div className="flex shrink-0" style={{ height: topSection.height }}>
				<div className="border-base-200 w-1/2 border-r">
					<OverviewCard className="size-full" />
				</div>
				<div className="relative z-30 w-1/2 overflow-visible">
					<Cat
						ref={catRef}
						face={settings.cat.equippedFace}
						hat={settings.cat.equippedHat}
						size={topSection.width}
						className="absolute right-0 bottom-0"
						onTap={handleCatTap}
					/>
					<IconButton
						variant="bare"
						size="sm"
						className="absolute top-1 right-1 z-40"
						onClick={handleRandomize}
					>
						<ShuffleIcon className="size-3" />
					</IconButton>
				</div>
			</div>

			{/* Timer */}
			<TimerView cx={timerViewCx} className="flex-1" />
		</div>
	);
}
