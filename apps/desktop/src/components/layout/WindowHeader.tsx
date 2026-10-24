import { Badge, cn, RefreshCcwIcon } from '@repo/ui';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Maximize2, Minus, X } from 'lucide-react';
import React from 'react';
import { useAppInfo, usePlatform, useUpdateChecker } from '@/hooks';

export const WindowHeader: React.FC<TWindowHeaderProps> = (props) => {
	const { title, showBadge = true, showWindowControls = false, children, className } = props;
	const platform = usePlatform();
	const appInfo = useAppInfo();
	const { updateAvailable, updateInfo, installing, install } = useUpdateChecker();

	const handleUpdateClick = React.useCallback(() => {
		void install();
	}, [install]);

	const handleMinimize = React.useCallback(async () => {
		try {
			await getCurrentWindow().minimize();
		} catch (error) {
			console.error('FocusCat could not minimize the window:', error);
		}
	}, []);

	const handleFullscreen = React.useCallback(async () => {
		const window = getCurrentWindow();
		try {
			await window.setFullscreen(!(await window.isFullscreen()));
		} catch (error) {
			console.error('FocusCat could not toggle fullscreen:', error);
		}
	}, []);

	const handleClose = React.useCallback(async () => {
		try {
			await getCurrentWindow().close();
		} catch (error) {
			console.error('FocusCat could not close the window:', error);
		}
	}, []);

	return (
		<header
			className={cn(
				'border-base-200 bg-base-50 flex h-8 shrink-0 items-center border-b select-none',
				platform === 'macos' ? 'pl-[70px]' : 'pl-2',
				className
			)}
		>
			{showWindowControls && platform !== 'macos' && (
				<div className="mr-2 flex shrink-0 items-center gap-1.5" aria-label="Window controls">
					<button
						type="button"
						title="Close window"
						aria-label="Close window"
						onClick={handleClose}
						className="group flex size-3 items-center justify-center rounded-full bg-[#ff5f57] transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5f57]"
					>
						<X className="size-2 text-black/80 opacity-0 group-hover:opacity-100" strokeWidth={3} />
					</button>
					<button
						type="button"
						title="Minimize window"
						aria-label="Minimize window"
						onClick={handleMinimize}
						className="group flex size-3 items-center justify-center rounded-full bg-[#febc2e] transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#febc2e]"
					>
						<Minus className="size-2 text-black/80 opacity-0 group-hover:opacity-100" strokeWidth={3} />
					</button>
					<button
						type="button"
						title="Toggle fullscreen"
						aria-label="Toggle fullscreen"
						onClick={handleFullscreen}
						className="group flex size-3 items-center justify-center rounded-full bg-[#28c840] transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#28c840]"
					>
						<Maximize2 className="size-2 text-black/80 opacity-0 group-hover:opacity-100" strokeWidth={3} />
					</button>
				</div>
			)}
			{title != null && <span className="text-base-600 ml-2 text-sm font-semibold">{title}</span>}
			{showBadge &&
				(appInfo.stage === 'dev' ? (
					<Badge variant="warning" className="ml-2">
						DEV
					</Badge>
				) : (
					appInfo.version.startsWith('v0.') &&
					appInfo.distribution !== 'appStore' && (
						<Badge className="ml-2 bg-purple-400/10 text-purple-400">BETA</Badge>
					)
				))}
			{updateAvailable && (
				<Badge
					variant={
						installing
							? 'neutral'
							: updateInfo.urgency === 'warning'
								? 'warning'
								: updateInfo.urgency === 'urgent'
									? 'error'
									: 'neutral'
					}
					className={cn('ml-2 p-1', !installing && 'cursor-pointer hover:opacity-80')}
					onClick={installing ? undefined : handleUpdateClick}
				>
					<RefreshCcwIcon size={12} className={installing ? 'animate-spin' : undefined} />
				</Badge>
			)}
			{/* Only the empty part of the header is draggable. Keeping the whole header
			    as a drag region causes Tauri to swallow clicks on its child buttons. */}
			<div data-tauri-drag-region className="flex-1 self-stretch" />
			{children != null && <div className="flex items-center gap-0.5 pr-1">{children}</div>}
		</header>
	);
};

export interface TWindowHeaderProps {
	title?: string;
	showBadge?: boolean;
	showWindowControls?: boolean;
	children?: React.ReactNode;
	className?: string;
}
