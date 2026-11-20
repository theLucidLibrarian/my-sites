    const START_MINS = 0; // 12:00 AM (midnight)
    const END_MINS = 24 * 60;  // 12:00 AM (midnight)
    const TOTAL_MINS = END_MINS - START_MINS; // 420 mins in the viewable track
    const FOCUS_ZOOM = 800;
    const MAX_ZOOM = 1600;
    const verticalTimelineQuery = window.matchMedia('(max-width: 800px)');
    let previousVerticalTimeline = verticalTimelineQuery.matches;

    const savedZoom = Number(localStorage.getItem('bellScheduleZoom'));
    let currentZoom = Number.isFinite(savedZoom) && savedZoom >= 100
        ? Math.min(MAX_ZOOM, savedZoom)
        : 100;
    let currentScheduleMinutes = START_MINS;
    let followPlayhead = true;
    let expectedTimelineScroll = null;
    let lastFollowMinute = null;
    let displayedDateKey = '';
    const dateFormatter = new Intl.DateTimeFormat(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    // Default block colors for distinction
    const DEFAULT_COLORS = {
        "1": "#1e3a8a", // dark muted blue
        "2": "#312e81", // deep indigo
        "3": "#134e4a", // dark teal
        "4": "#78350f", // dark brown/amber
        "5": "#7f1d1d", // muted maroon
        "6": "#0f766e", // dark slate green
        "7": "#701a75", // dark fuchsia
        "Nutrition": "#27272a", // deep slate
        "Lunch": "#27272a"      // deep slate
    };

    // Load preferences from local storage
    let userPrefs = JSON.parse(localStorage.getItem('bellSchedulePrefs')) || {};
    let isAWeek = localStorage.getItem('isAWeek') === 'true' ? true : false;
    let isMinDay = localStorage.getItem('isMinDay') === 'true' ? true : false;
    let currentLayout = [];
    let editingBlockId = null;

    // Helpers
    function parseTime(t) {
        let [h, m] = t.split(':').map(Number);
        if (h < 7) h += 12; // Convert PM assuming classes end before 7pm
        return h * 60 + m;
    }

    function formatTime(mins) {
        let h = Math.floor(mins / 60);
        let m = mins % 60;
        h = h % 12 || 12;
        return `${h}:${m.toString().padStart(2, '0')}`;
    }

    // Schedule Data mapping
    const rawData = {
        A: {
            reg: [
                ["1", "8:30", "9:19"], ["2", "9:24", "10:13"], ["Nutrition", "10:13", "10:26"],
                ["3", "10:31", "11:21"], ["4", "11:26", "12:15"], ["5", "12:20", "1:09"],
                ["Lunch", "1:09", "1:41"], ["6", "1:46", "2:35"], ["7", "2:40", "3:29"]
            ],
            wedEarly: [
                ["1", "8:30", "9:08"], ["2", "9:13", "9:51"], ["Nutrition", "9:51", "10:04"],
                ["3", "10:09", "10:51"], ["4", "10:56", "11:34"], ["5", "11:39", "12:17"],
                ["Lunch", "12:17", "12:49"], ["6", "12:54", "1:32"], ["7", "1:37", "2:15"]
            ],
            wedMin: [
                ["1", "8:30", "9:05"], ["2", "9:10", "9:45"], ["3", "9:50", "10:25"],
                ["4", "10:30", "11:05"], ["Nutrition", "11:05", "11:18"], ["5", "11:23", "11:58"],
                ["6", "12:03", "12:38"], ["7", "12:43", "1:18"], ["Lunch", "1:18", "1:50"]
            ]
        },
        B: {
            reg: [
                ["1", "8:30", "9:19"], ["2", "9:24", "10:13"], ["Nutrition", "10:13", "10:26"],
                ["3", "10:31", "11:21"], ["4", "11:26", "12:15"], ["5", "12:20", "1:09"],
                ["Lunch", "1:09", "1:41"], ["6", "1:46", "2:35"], ["7", "2:40", "3:29"]
            ],
            tue: [
                ["1", "8:30", "9:40"], ["Nutrition", "9:40", "9:53"], ["2", "9:58", "11:12"],
                ["3", "11:17", "12:27"], ["Lunch", "12:27", "12:59"], ["6", "1:04", "2:14"], ["7", "2:19", "3:29"]
            ],
            wedEarly: [
                ["4", "8:30", "9:40"], ["Nutrition", "9:40", "9:53"], ["5", "9:58", "11:13"],
                ["2", "11:18", "12:28"], ["Lunch", "12:28", "1:00"], ["1", "1:05", "2:15"]
            ],
            thu: [
                ["3", "8:30", "9:40"], ["Nutrition", "9:40", "9:53"], ["4", "9:58", "11:12"],
                ["5", "11:17", "12:27"], ["Lunch", "12:27", "12:59"], ["6", "1:04", "2:14"], ["7", "2:19", "3:29"]
            ],
            wedMin: [
                ["4", "8:30", "9:34"], ["5", "9:39", "10:43"], ["Nutrition", "10:43", "10:56"],
                ["2", "11:01", "12:09"], ["1", "12:14", "1:18"], ["Lunch", "1:18", "1:50"]
            ]
        }
    };

    function mapData(arr) {
        return arr.map(b => ({
            id: b[0], // Keep raw ID for mapping (e.g. "1", "Nutrition")
            defaultName: b[0].length === 1 ? `Period ${b[0]}` : b[0],
            s: parseTime(b[1]),
            e: parseTime(b[2]),
            type: 'editable'
        }));
    }

    // UI Elements
    const ui = {
        workspace: document.getElementById('workspace'),
        timelineViewport: document.getElementById('timeline-viewport'),
        timelineContent: document.getElementById('timeline-content'),
        trackResizeHandle: document.getElementById('track-resize-handle'),
        zoomSlider: document.getElementById('zoom-slider'),
        panSlider: document.getElementById('pan-slider'),
        zoomValue: document.getElementById('zoom-value'),
        zoomReset: document.getElementById('zoom-reset'),
        focusPlayhead: document.getElementById('focus-playhead'),
        btnA: document.getElementById('btn-a-week'),
        btnB: document.getElementById('btn-b-week'),
        btnMin: document.getElementById('btn-min-day'),
        dayOverrideGroup: document.getElementById('day-override-group'),
        dayOverride: document.getElementById('day-override'),
        dayOverridePicker: document.getElementById('day-override-picker'),
        dayOverrideButton: document.getElementById('day-override-button'),
        dayOverrideValue: document.getElementById('day-override-value'),
        dayOverrideOptions: document.getElementById('day-override-options'),
        track: document.getElementById('track-container'),
        playhead: document.getElementById('playhead'),
        playheadTime: document.getElementById('playhead-time'),
        ruler: document.getElementById('ruler'),
        rulerPlayhead: document.getElementById('ruler-playhead'),
        boundaryLabels: document.getElementById('boundary-labels'),
        boundaryLabelContent: document.getElementById('boundary-label-content'),
        liveTime: document.getElementById('live-time'),
        liveDate: document.getElementById('live-date'),
        currPeriod: document.getElementById('current-period'),
        nextPeriod: document.getElementById('next-period'),
        countdown: document.getElementById('countdown'),
        popoutButton: document.getElementById('btn-popout'),
        popoutStatus: document.getElementById('popout-status'),
        
        // Modal
        overlay: document.getElementById('modal-overlay'),
        modalTitle: document.getElementById('modal-title'),
        modalName: document.getElementById('modal-name'),
        modalColor: document.getElementById('modal-color')
    };

    const dayOverrideOptionButtons = Array.from(
        ui.dayOverrideOptions.querySelectorAll('[role="option"]')
    );

    function syncDayOverridePicker() {
        const selectedOption = dayOverrideOptionButtons.find(
            option => option.dataset.value === ui.dayOverride.value
        );
        if (!selectedOption) return;
        ui.dayOverrideValue.textContent = selectedOption.textContent;
        dayOverrideOptionButtons.forEach(option => {
            option.setAttribute('aria-selected', String(option === selectedOption));
        });
    }

    function closeDayOverridePicker(returnFocus = false) {
        ui.dayOverrideOptions.hidden = true;
        ui.dayOverrideButton.setAttribute('aria-expanded', 'false');
        if (returnFocus) ui.dayOverrideButton.focus();
    }

    function openDayOverridePicker() {
        if (ui.dayOverrideButton.disabled) return;
        syncDayOverridePicker();
        ui.dayOverrideOptions.hidden = false;
        ui.dayOverrideButton.setAttribute('aria-expanded', 'true');
        dayOverrideOptionButtons.find(
            option => option.dataset.value === ui.dayOverride.value
        ).focus();
    }

    ui.dayOverrideButton.addEventListener('click', () => {
        if (ui.dayOverrideOptions.hidden) {
            openDayOverridePicker();
        } else {
            closeDayOverridePicker();
        }
    });

    ui.dayOverrideButton.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openDayOverridePicker();
        }
    });

    dayOverrideOptionButtons.forEach(option => {
        option.addEventListener('click', () => {
            ui.dayOverride.value = option.dataset.value;
            ui.dayOverride.dispatchEvent(new Event('change', { bubbles: true }));
            closeDayOverridePicker(true);
        });
    });

    ui.dayOverrideOptions.addEventListener('keydown', event => {
        const currentIndex = dayOverrideOptionButtons.indexOf(event.target);
        let nextIndex = currentIndex;
        if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % dayOverrideOptionButtons.length;
        else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + dayOverrideOptionButtons.length) % dayOverrideOptionButtons.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = dayOverrideOptionButtons.length - 1;
        else if (event.key === 'Escape') {
            event.preventDefault();
            closeDayOverridePicker(true);
            return;
        } else if (event.key === 'Tab') {
            closeDayOverridePicker();
            return;
        } else {
            return;
        }
        event.preventDefault();
        dayOverrideOptionButtons[nextIndex].focus();
    });

    document.addEventListener('pointerdown', event => {
        if (!ui.dayOverridePicker.contains(event.target)) closeDayOverridePicker();
    });

    let countdownWindow = null;
    let countdownWindowValues = null;

    function getNextBlock() {
        return currentLayout.find(block =>
            block.type === 'editable' && block.s > currentScheduleMinutes);
    }

    function getBlockName(block) {
        return (userPrefs[block.id] || {}).name || block.defaultName;
    }

    function getBlockColor(block) {
        return (userPrefs[block.id] || {}).color || DEFAULT_COLORS[block.id] || '#333333';
    }

    function updateCountdownWindow() {
        if (!countdownWindowValues || !countdownWindow || countdownWindow.closed) return;
        countdownWindowValues.currentPeriod.textContent = ui.currPeriod.textContent;
        countdownWindowValues.countdown.textContent = ui.countdown.textContent;
        const nextBlock = getNextBlock();
        countdownWindowValues.nextPeriod.textContent = nextBlock ? getBlockName(nextBlock) : 'None';
    }

    async function openCountdownWindow() {
        if (countdownWindow && !countdownWindow.closed) {
            countdownWindow.close();
            return;
        }

        ui.popoutStatus.textContent = '';
        if (!window.documentPictureInPicture) {
            ui.popoutStatus.textContent = 'Always-on-top pop-out is not supported by this browser.';
            return;
        }
        try {
            countdownWindow = await window.documentPictureInPicture.requestWindow({
                width: 320,
                height: 190
            });
            countdownWindow.document.title = 'Schedule Countdown';
            countdownWindow.document.head.innerHTML = '';
            const style = countdownWindow.document.createElement('style');
            style.textContent = `
                * { box-sizing: border-box; }
                body {
                    margin: 0;
                    background: #1e1e24;
                    color: #f4f4f5;
                    font: 14px Consolas, "Courier New", monospace;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                main {
                    width: 100%;
                    padding: 20px;
                    text-align: center;
                }
                .row {
                    margin: 12px 0;
                    font-size: 16px;
                    overflow-wrap: anywhere;
                }
                .label {
                    color: #a1a1aa;
                }
                #countdown-value {
                    color: #ef4444;
                    font-size: 24px;
                    font-weight: bold;
                }
                .period-value {
                    font-weight: bold;
                }
            `;
            countdownWindow.document.head.appendChild(style);
            countdownWindow.document.body.innerHTML = `
                <main>
                    <div class="row"><span class="label">Current period:</span> <span id="current-period-value" class="period-value">--</span></div>
                    <div class="row"><span class="label">Time Remaining:</span> <span id="countdown-value">--:--:--</span></div>
                    <div class="row"><span class="label">Up next:</span> <span id="next-period" class="period-value">--</span></div>
                </main>
            `;
            countdownWindowValues = {
                currentPeriod: countdownWindow.document.getElementById('current-period-value'),
                countdown: countdownWindow.document.getElementById('countdown-value'),
                nextPeriod: countdownWindow.document.getElementById('next-period')
            };
            countdownWindow.addEventListener('pagehide', () => {
                countdownWindow = null;
                countdownWindowValues = null;
                ui.popoutButton.textContent = 'POP OUT';
                ui.popoutButton.title = 'Open an always-on-top countdown window';
            }, { once: true });
            ui.popoutButton.textContent = 'CLOSE';
            ui.popoutButton.title = 'Close the always-on-top countdown window';
            updateCountdownWindow();
        } catch (error) {
            ui.popoutStatus.textContent = 'Could not open pop-out window.';
            ui.popoutButton.title = error instanceof Error ? error.message : String(error);
            countdownWindow = null;
            countdownWindowValues = null;
        }
    }

    document.querySelectorAll('.summary-popout-trigger').forEach(trigger => {
        trigger.addEventListener('click', openCountdownWindow);
    });

    if ('documentPictureInPicture' in window) {
        ui.popoutButton.addEventListener('click', openCountdownWindow);
    } else {
        ui.popoutButton.hidden = true;
        ui.popoutButton.disabled = true;
        ui.popoutButton.title = 'Always-on-top pop-out is not supported by this browser.';
        ui.popoutStatus.textContent = '';
    }

    function getTrackHeightLimits() {
        const rulerHeight = ui.ruler.getBoundingClientRect().height
            + parseFloat(getComputedStyle(ui.ruler).marginBottom);
        const minHeight = 80;
        const maxHeight = Math.max(minHeight,
            ui.timelineViewport.clientHeight - rulerHeight - ui.trackResizeHandle.offsetHeight);
        return { minHeight, maxHeight };
    }

    function setTrackHeight(height) {
        if (isVerticalTimeline()) {
            ui.track.style.flex = '';
            ui.track.style.height = '';
            ui.trackResizeHandle.hidden = true;
            return;
        }

        const { minHeight, maxHeight } = getTrackHeightLimits();
        const clampedHeight = Math.min(maxHeight, Math.max(minHeight, height));

        ui.trackResizeHandle.hidden = false;
        ui.track.style.flex = `0 0 ${clampedHeight}px`;
        ui.trackResizeHandle.setAttribute('aria-valuemin', minHeight);
        ui.trackResizeHandle.setAttribute('aria-valuemax', maxHeight);
        ui.trackResizeHandle.setAttribute('aria-valuenow', Math.round(clampedHeight));
        ui.trackResizeHandle.style.width = ui.track.style.width;
        localStorage.setItem('bellScheduleTrackHeight', Math.round(clampedHeight));
    }

    ui.trackResizeHandle.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        ui.trackResizeHandle.setPointerCapture(event.pointerId);
        ui.trackResizeHandle.dataset.startY = event.clientY;
        ui.trackResizeHandle.dataset.startHeight = ui.track.getBoundingClientRect().height;
    });

    ui.trackResizeHandle.addEventListener('pointermove', (event) => {
        if (ui.trackResizeHandle.hasPointerCapture(event.pointerId)) {
            const startY = Number(ui.trackResizeHandle.dataset.startY);
            const startHeight = Number(ui.trackResizeHandle.dataset.startHeight);
            setTrackHeight(startHeight + event.clientY - startY);
        }
    });

    ui.trackResizeHandle.addEventListener('keydown', (event) => {
        const currentHeight = ui.track.getBoundingClientRect().height;
        const { minHeight, maxHeight } = getTrackHeightLimits();
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setTrackHeight(currentHeight - 10);
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            setTrackHeight(currentHeight + 10);
        } else if (event.key === 'Home') {
            event.preventDefault();
            setTrackHeight(minHeight);
        } else if (event.key === 'End') {
            event.preventDefault();
            setTrackHeight(maxHeight);
        }
    });

    function isVerticalTimeline() {
        return verticalTimelineQuery.matches;
    }

    function getTimelineViewportExtent() {
        const style = getComputedStyle(ui.timelineViewport);
        const vertical = isVerticalTimeline();
        const paddingStart = parseFloat(vertical ? style.paddingTop : style.paddingLeft);
        const paddingEnd = parseFloat(vertical ? style.paddingBottom : style.paddingRight);
        return (vertical ? ui.timelineViewport.clientHeight : ui.timelineViewport.clientWidth)
            - paddingStart - paddingEnd;
    }

    function getTimelineScrollPosition() {
        return isVerticalTimeline()
            ? ui.timelineViewport.scrollTop
            : ui.timelineViewport.scrollLeft;
    }

    function formatZoom(zoom) {
        let numerator = zoom;
        let denominator = FOCUS_ZOOM;
        while (denominator !== 0) {
            [numerator, denominator] = [denominator, numerator % denominator];
        }
        const divisor = numerator;
        const whole = zoom / divisor;
        const base = FOCUS_ZOOM / divisor;
        return base === 1 ? `${whole}x` : `${whole}/${base}x`;
    }

    function setZoom(zoom, centerPlayhead = true) {
        const vertical = isVerticalTimeline();
        const viewportExtentBeforeZoom = getTimelineViewportExtent();
        const previousExtent = vertical ? ui.ruler.clientHeight : ui.ruler.clientWidth;
        const previousGutter = parseFloat(getComputedStyle(ui.timelineContent)[
            vertical ? 'paddingTop' : 'paddingLeft'
        ]);
        const previousCenter = previousExtent > 0
            ? (getTimelineScrollPosition() + viewportExtentBeforeZoom / 2 - previousGutter) / previousExtent
            : 0.5;
        currentZoom = Math.min(MAX_ZOOM, Math.max(100, zoom));
        localStorage.setItem('bellScheduleZoom', currentZoom);
        ui.zoomSlider.value = currentZoom;
        const zoomLabel = formatZoom(currentZoom);
        ui.zoomValue.value = zoomLabel;
        ui.zoomSlider.setAttribute('aria-valuetext', zoomLabel);

        const viewportExtent = getTimelineViewportExtent();
        const timelineExtent = Math.round(viewportExtent * currentZoom / 100);
        const sideGutter = vertical ? viewportExtent * 0.05 : 0;
        if (vertical) {
            ui.timelineContent.style.width = '';
            ui.timelineContent.style.height = `${timelineExtent + sideGutter * 2}px`;
            ui.timelineContent.style.paddingLeft = '';
            ui.timelineContent.style.paddingRight = '';
            ui.timelineContent.style.paddingTop = `${sideGutter}px`;
            ui.timelineContent.style.paddingBottom = `${sideGutter}px`;
            ui.ruler.style.width = '';
            ui.ruler.style.height = `${timelineExtent}px`;
            ui.track.style.flex = '';
            ui.track.style.width = '';
            ui.track.style.height = `${timelineExtent}px`;
            ui.trackResizeHandle.style.width = '';
            ui.trackResizeHandle.style.height = `${timelineExtent}px`;
        } else {
            ui.timelineContent.style.width = `${timelineExtent + sideGutter * 2}px`;
            ui.timelineContent.style.height = '';
            ui.timelineContent.style.paddingLeft = `${sideGutter}px`;
            ui.timelineContent.style.paddingRight = `${sideGutter}px`;
            ui.timelineContent.style.paddingTop = '';
            ui.timelineContent.style.paddingBottom = '';
            ui.ruler.style.width = `${timelineExtent}px`;
            ui.ruler.style.height = '';
            ui.track.style.width = `${timelineExtent}px`;
            ui.track.style.height = '';
            ui.trackResizeHandle.style.width = `${timelineExtent}px`;
            ui.trackResizeHandle.style.height = '';
            fitTimelineBlockText();
        }
        buildRuler();
        positionPlayheadBubble();

        if (centerPlayhead && followPlayhead) {
            focusPlayhead();
        } else if (centerPlayhead) {
            setTimelineScroll(sideGutter + previousCenter * timelineExtent - viewportExtent / 2);
        } else {
            setTimelineScroll(0);
        }
    }

    function setTimelineScroll(left) {
        const vertical = isVerticalTimeline();
        const maxScroll = Math.max(0, vertical
            ? ui.timelineViewport.scrollHeight - ui.timelineViewport.clientHeight
            : ui.timelineViewport.scrollWidth - ui.timelineViewport.clientWidth);
        const target = Math.min(maxScroll, Math.max(0, left));
        const currentScroll = getTimelineScrollPosition();
        if (Math.abs(currentScroll - target) > 0.01) {
            if (vertical) {
                ui.timelineViewport.scrollTop = target;
            } else {
                ui.timelineViewport.scrollLeft = target;
            }
            const nextScroll = getTimelineScrollPosition();
            if (nextScroll !== currentScroll) {
                expectedTimelineScroll = nextScroll;
            }
        }
        syncPanSlider();
    }

    function setFollowing(following) {
        followPlayhead = following;
        if (following) lastFollowMinute = null;
        ui.focusPlayhead.classList.toggle('active', following);
        ui.focusPlayhead.setAttribute('aria-pressed', String(following));
    }

    function focusPlayhead() {
        const viewportExtent = getTimelineViewportExtent();
        const timelineExtent = isVerticalTimeline() ? ui.ruler.clientHeight : ui.ruler.clientWidth;
        const sideGutter = parseFloat(getComputedStyle(ui.timelineContent)[
            isVerticalTimeline() ? 'paddingTop' : 'paddingLeft'
        ]);
        const progress = Math.min(1, Math.max(0,
            (currentScheduleMinutes - START_MINS) / TOTAL_MINS));
        setTimelineScroll(sideGutter + progress * timelineExtent - viewportExtent / 2);
    }

    function syncPanSlider() {
        const maxScroll = Math.max(0, isVerticalTimeline()
            ? ui.timelineViewport.scrollHeight - ui.timelineViewport.clientHeight
            : ui.timelineViewport.scrollWidth - ui.timelineViewport.clientWidth);
        const vertical = isVerticalTimeline();
        ui.panSlider.setAttribute('aria-label',
            vertical ? 'Scroll schedule vertically' : 'Scroll schedule horizontally');
        ui.panSlider.disabled = maxScroll <= 1;
        ui.panSlider.value = maxScroll > 0
            ? Math.round(getTimelineScrollPosition() / maxScroll * Number(ui.panSlider.max))
            : 0;
    }

    ui.zoomSlider.addEventListener('input', () => setZoom(Number(ui.zoomSlider.value)));
    ui.zoomReset.addEventListener('click', () => setZoom(FOCUS_ZOOM, false));
    ui.focusPlayhead.addEventListener('click', () => {
        setFollowing(true);
        updateTick();
        setZoom(FOCUS_ZOOM);
    });
    ui.panSlider.addEventListener('input', () => {
        setFollowing(false);
        const maxScroll = isVerticalTimeline()
            ? ui.timelineViewport.scrollHeight - ui.timelineViewport.clientHeight
            : ui.timelineViewport.scrollWidth - ui.timelineViewport.clientWidth;
        setTimelineScroll(maxScroll * Number(ui.panSlider.value) / Number(ui.panSlider.max));
    });
    ui.timelineViewport.addEventListener('scroll', () => {
        const currentScroll = getTimelineScrollPosition();
        if (expectedTimelineScroll === null || Math.abs(currentScroll - expectedTimelineScroll) > 1) {
            setFollowing(false);
        }
        expectedTimelineScroll = null;
        syncPanSlider();
    });
    ui.timelineViewport.addEventListener('wheel', (event) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        setZoom(currentZoom + (event.deltaY < 0 ? 25 : -25));
    }, { passive: false });

    window.addEventListener('resize', () => {
        const vertical = isVerticalTimeline();
        const orientationChanged = vertical !== previousVerticalTimeline;
        previousVerticalTimeline = vertical;
        if (vertical) {
            ui.trackResizeHandle.hidden = true;
            ui.track.style.flex = '';
            ui.track.style.height = '';
        } else {
            ui.timelineContent.style.height = '';
            ui.timelineContent.style.paddingTop = '';
            ui.timelineContent.style.paddingBottom = '';
            ui.ruler.style.height = '';
            ui.track.style.height = '';
            ui.trackResizeHandle.hidden = false;
        }
        setZoom(currentZoom);
        if (!vertical && ui.track.style.flex !== '') {
            setTrackHeight(ui.track.getBoundingClientRect().height);
        } else if (!vertical) {
            const { maxHeight } = getTrackHeightLimits();
            const savedHeight = Number(localStorage.getItem('bellScheduleTrackHeight'));
            setTrackHeight(Number.isFinite(savedHeight) && savedHeight > 0 ? savedHeight : maxHeight);
        }
        if (orientationChanged) buildTimeline();
        updateTick();
        fitLiveDate();
    });
    verticalTimelineQuery.addEventListener('change', () => {
        window.dispatchEvent(new Event('resize'));
    });
    const { maxHeight: trackMaxHeight } = getTrackHeightLimits();
    const savedTrackHeight = Number(localStorage.getItem('bellScheduleTrackHeight'));
    setTrackHeight(Number.isFinite(savedTrackHeight) && savedTrackHeight > 0
        ? savedTrackHeight
        : trackMaxHeight);

    // Ruler Generation
    function buildRuler() {
        const vertical = isVerticalTimeline();
        ui.ruler.replaceChildren(ui.rulerPlayhead, ui.boundaryLabels);
        ui.boundaryLabelContent.replaceChildren();
        const rulerExtent = vertical ? ui.ruler.clientHeight : ui.ruler.clientWidth;
        const boundaryWidth = ui.boundaryLabels.clientWidth;
        const pixelsPerMinute = rulerExtent / TOTAL_MINS;
        const labelIntervals = vertical ? [1, 5, 10, 15, 30, 60, 120, 180, 240] : [1, 5, 10, 15, 30, 60];
        const interval = labelIntervals.find(minutes => minutes * pixelsPerMinute >= (vertical ? 24 : 80))
            || labelIntervals[labelIntervals.length - 1];
        const boundaries = new Map();
        currentLayout.filter(block => block.type === 'editable').forEach(block => {
            const name = (userPrefs[block.id] || {}).name || block.defaultName;
            for (const [minute, description] of [[block.s, `${name} starts`], [block.e, `${name} ends`]]) {
                if (!boundaries.has(minute)) boundaries.set(minute, []);
                boundaries.get(minute).push(description);
            }
        });

        const rows = [];
        const boundaryLabels = Array.from(boundaries, ([minute, descriptions]) => {
            const position = (minute - START_MINS) * pixelsPerMinute;
            if (vertical) return { minute, descriptions };
            const left = Math.max(0, Math.min(boundaryWidth - 64, position - 32));
            let row = rows.findIndex(end => left >= end);
            if (row === -1) row = rows.length;
            rows[row] = left + 68;
            return { minute, descriptions, left, row };
        });
        const labelOffset = Math.max(0, ui.boundaryLabels.clientHeight - rows.length * 16);
        if (!vertical) ui.boundaryLabelContent.style.height = `${labelOffset + rows.length * 16}px`;

        const tickPaths = ['', '', ''];
        for (let m = START_MINS; m <= END_MINS; m++) {
            let pct = ((m - START_MINS) / TOTAL_MINS) * 100;
            
            if (vertical) {
                let tick = document.createElement('div');
                tick.className = 'tick';
                tick.style.top = `${pct}%`;
                tick.style.width = m % 60 === 0 ? '12px' : m % 5 === 0 ? '8px' : '4px';
                if (m % 5 !== 0) tick.style.opacity = '0.5';
                ui.ruler.appendChild(tick);
            } else {
                const kind = m % 60 === 0 ? 2 : m % 5 === 0 ? 1 : 0;
                tickPaths[kind] += `M${m - START_MINS} 12v-${[4, 8, 12][kind]}`;
            }
            
            if (m % interval === 0) {
                let label = document.createElement('div');
                label.className = 'tick-label';
                const position = Math.max(vertical ? 8 : 32,
                    Math.min(rulerExtent - (vertical ? 8 : 32), (m - START_MINS) * pixelsPerMinute));
                if (vertical) {
                    label.style.top = `${position}px`;
                } else {
                    label.style.left = `${position}px`;
                }
                label.textContent = `${formatTime(m)} ${m % 1440 < 12 * 60 ? 'AM' : 'PM'}`;
                ui.ruler.appendChild(label);
            }
        }

        if (!vertical) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.classList.add('ruler-ticks');
            svg.setAttribute('viewBox', `0 0 ${TOTAL_MINS} 12`);
            svg.setAttribute('preserveAspectRatio', 'none');
            svg.setAttribute('aria-hidden', 'true');
            tickPaths.forEach((commands, index) => {
                const path = document.createElementNS(svg.namespaceURI, 'path');
                path.setAttribute('d', commands);
                path.setAttribute('vector-effect', 'non-scaling-stroke');
                if (index === 0) path.setAttribute('opacity', '0.5');
                svg.appendChild(path);
            });
            ui.ruler.appendChild(svg);
        }

        boundaryLabels.forEach(({ minute, descriptions, left, row }) => {
            const tick = document.createElement('div');
            tick.className = 'boundary-tick';
            if (vertical) {
                tick.style.top = `${(minute - START_MINS) / TOTAL_MINS * 100}%`;
                tick.style.width = '12px';
            } else {
                tick.style.left = `${(minute - START_MINS) / TOTAL_MINS * 100}%`;
                tick.style.height = '12px';
            }
            tick.title = descriptions.join('; ');
            ui.ruler.appendChild(tick);

            if (vertical) return;
            const label = document.createElement('div');
            label.className = 'boundary-label';
            label.style.left = `${left}px`;
            label.style.top = `${labelOffset + row * 16}px`;
            label.textContent = `${formatTime(minute)} ${minute % 1440 < 12 * 60 ? 'AM' : 'PM'}`;
            label.title = descriptions.join('; ');
            ui.boundaryLabelContent.appendChild(label);
        });

        if (ui.track.style.flex && ui.track.getBoundingClientRect().height > getTrackHeightLimits().maxHeight) {
            setTrackHeight(getTrackHeightLimits().maxHeight);
        }
    }

    function getActiveSchedule() {
        let override = parseInt(ui.dayOverride.value);
        let day = override !== -1 ? override : new Date().getDay();
        if (day === 0 || day === 6) day = 1; // Default to Mon on weekends

        if (isAWeek) {
            if (day === 3) return isMinDay ? mapData(rawData.A.wedMin) : mapData(rawData.A.wedEarly);
            return mapData(rawData.A.reg);
        } else {
            if (day === 1 || day === 5) return mapData(rawData.B.reg);
            if (day === 2) return mapData(rawData.B.tue);
            if (day === 4) return mapData(rawData.B.thu);
            if (day === 3) return isMinDay ? mapData(rawData.B.wedMin) : mapData(rawData.B.wedEarly);
            return mapData(rawData.B.reg);
        }
    }

    function updateControls() {
        ui.btnA.checked = isAWeek;
        ui.btnB.checked = !isAWeek;
        ui.btnMin.classList.toggle('active', isMinDay);
        ui.btnMin.setAttribute('aria-pressed', String(isMinDay));
        ui.dayOverride.disabled = isAWeek;
        ui.dayOverrideButton.disabled = isAWeek;
        ui.dayOverrideGroup.classList.toggle('is-disabled', isAWeek);
        if (isAWeek) closeDayOverridePicker();
        
        localStorage.setItem('isAWeek', isAWeek);
        localStorage.setItem('isMinDay', isMinDay);
        
        buildTimeline();
    }

    function fitBlockText(block, width) {
        block.querySelectorAll('.block-name, .block-time').forEach(element => {
            if (width <= 0) {
                element.style.setProperty('--fitted-font-size', '0px');
            } else {
                fitTextToWidth(element, () => width);
            }
        });
    }

    const blockTextObserver = new ResizeObserver(entries => {
        if (isVerticalTimeline()) return;
        entries.forEach(entry => {
            fitBlockText(entry.target, entry.contentRect.width);
        });
    });

    function fitTimelineBlockText() {
        ui.track.querySelectorAll('.block.editable').forEach(block => {
            const style = getComputedStyle(block);
            const width = block.getBoundingClientRect().width
                - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
                - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
            fitBlockText(block, width);
        });
    }

    function buildTimeline() {
        blockTextObserver.disconnect();
        // Clear old blocks, keeping playhead
        Array.from(ui.track.children).forEach(child => {
            if (child.id !== 'playhead') ui.track.removeChild(child);
        });

        currentLayout = [];
        let schedule = getActiveSchedule();
        let currentTimeMarker = START_MINS;

        for (let i = 0; i < schedule.length; i++) {
            let block = schedule[i];

            // Gap filling (Passing periods)
            if (block.s > currentTimeMarker) {
                currentLayout.push({ name: i === 0 ? 'Before School' : 'Passing', s: currentTimeMarker, e: block.s, type: 'passing' });
            }
            currentLayout.push(block);
            currentTimeMarker = block.e;
        }

        if (currentTimeMarker < END_MINS) {
            currentLayout.push({ name: 'Afterschool', s: currentTimeMarker, e: END_MINS, type: 'passing' });
        }

        // Render to Track
        currentLayout.forEach(b => {
            let dur = b.e - b.s;
            let pct = (dur / TOTAL_MINS) * 100;
            const vertical = isVerticalTimeline();
            
            let el = document.createElement('div');
            el.className = `block ${b.type}`;
            if (vertical) {
                el.style.width = '100%';
                el.style.height = `${pct}%`;
            } else {
                el.style.width = `${pct}%`;
            }
            
            if (b.type === 'editable') {
                let dName = getBlockName(b);
                let dColor = getBlockColor(b);
                
                el.style.backgroundColor = dColor;
                el.innerHTML = `
                    <div class="block-name">${dName}</div>
                    <div class="block-time">${formatTime(b.s)} - ${formatTime(b.e)}</div>
                `;
                el.onclick = () => openModal(b.id, dName, dColor);
            } else if (b.type === 'passing') {
                const timeStyle = vertical ? '' : ' style="writing-mode: vertical-rl; transform: rotate(180deg);"';
                el.innerHTML = `<div class="block-time"${timeStyle}>${dur}m</div>`;
            }

            ui.track.insertBefore(el, ui.playhead);
            if (b.type === 'editable') blockTextObserver.observe(el);
        });
        if (!isVerticalTimeline()) fitTimelineBlockText();
        buildRuler();
    }

    // Modal Logic
    function openModal(id, currentName, currentColor) {
        editingBlockId = id;
        ui.modalTitle.textContent = `Edit Block: ${id}`;
        ui.modalName.value = currentName;
        ui.modalColor.value = currentColor;
        ui.overlay.style.display = 'flex';
    }

    function closeModal() {
        ui.overlay.style.display = 'none';
        editingBlockId = null;
    }

    document.getElementById('btn-cancel').onclick = closeModal;
    
    document.getElementById('btn-save').onclick = () => {
        if (editingBlockId) {
            userPrefs[editingBlockId] = {
                name: ui.modalName.value.trim() || undefined,
                color: ui.modalColor.value
            };
            localStorage.setItem('bellSchedulePrefs', JSON.stringify(userPrefs));
            buildTimeline();
        }
        closeModal();
    };

    document.getElementById('btn-reset-block').onclick = () => {
        if (editingBlockId) {
            delete userPrefs[editingBlockId];
            localStorage.setItem('bellSchedulePrefs', JSON.stringify(userPrefs));
            buildTimeline();
        }
        closeModal();
    };

    // Close modal on outside click
    ui.overlay.onclick = (e) => {
        if(e.target === ui.overlay) closeModal();
    }

    // Tick & Playhead Updates
    function positionPlayheadBubble() {
        if (ui.playhead.style.display !== 'block') return;
        const vertical = isVerticalTimeline();
        const trackExtent = vertical ? ui.track.clientHeight : ui.track.clientWidth;
        const linePosition = parseFloat(vertical ? ui.playhead.style.top : ui.playhead.style.left)
            / 100 * trackExtent;
        const trackRect = ui.track.getBoundingClientRect();
        const rulerRect = ui.ruler.getBoundingClientRect();
        if (vertical) {
            ui.rulerPlayhead.style.top = `${trackRect.top + ui.track.clientTop + linePosition - rulerRect.top}px`;
            ui.rulerPlayhead.style.left = '';
            ui.playheadTime.style.setProperty('--bubble-offset', '0px');
            return;
        }
        ui.rulerPlayhead.style.left = `${trackRect.left + ui.track.clientLeft + linePosition - rulerRect.left}px`;
        ui.rulerPlayhead.style.top = '';
        const halfBubbleWidth = ui.playheadTime.offsetWidth / 2;
        const center = Math.max(halfBubbleWidth,
            Math.min(trackExtent - halfBubbleWidth, linePosition));
        ui.playheadTime.style.setProperty('--bubble-offset', `${center - linePosition}px`);
    }

    function fitTextToWidth(element, getAvailableWidth) {
        element.style.removeProperty('--fitted-font-size');
        if (!element.textContent) return;

        const availableWidth = getAvailableWidth();
        if (availableWidth <= 0) return;
        const range = document.createRange();
        range.selectNodeContents(element);
        const textWidth = range.getBoundingClientRect().width;
        if (textWidth > availableWidth) {
            const fontSize = parseFloat(getComputedStyle(element).fontSize);
            element.style.setProperty('--fitted-font-size', `${fontSize * Math.max(0, availableWidth - 1) / textWidth}px`);
        }
    }

    function fitSummaryName(element) {
        fitTextToWidth(element, () => element.parentElement.getBoundingClientRect().width);
    }

    function setSummaryName(element, name) {
        if (element.textContent === name) return;
        element.textContent = name;
        fitSummaryName(element);
    }

    function fitLiveDate() {
        ui.liveDate.style.removeProperty('--date-font-size');
        if (!ui.liveDate.textContent) return;

        const range = document.createRange();
        range.selectNodeContents(ui.liveTime);
        const clockWidth = range.getBoundingClientRect().width;
        range.selectNodeContents(ui.liveDate);
        const dateWidth = range.getBoundingClientRect().width;
        if (!clockWidth || !dateWidth) return;
        const availableWidth = Math.min(clockWidth, ui.liveDate.parentElement.clientWidth);
        const fontSize = parseFloat(getComputedStyle(ui.liveDate).fontSize);
        ui.liveDate.style.setProperty('--date-font-size', `${fontSize * (availableWidth - 1) / dateWidth}px`);
    }

    function updateTick() {
        let now = new Date();
        
        let h = now.getHours().toString().padStart(2, '0');
        let m = now.getMinutes().toString().padStart(2, '0');
        let s = now.getSeconds().toString().padStart(2, '0');
        ui.liveTime.textContent = `${h}:${m}:${s}`;
        
        let ampm = now.getHours() >= 12 ? 'PM' : 'AM';
        let bubbleH = now.getHours() % 12 || 12;
        ui.playheadTime.textContent = `${bubbleH}:${m}:${s} ${ampm}`;

        const dateKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
        if (dateKey !== displayedDateKey) {
            ui.liveDate.textContent = dateFormatter.format(now).toUpperCase();
            displayedDateKey = dateKey;
            fitLiveDate();
        }

        let curMins = (now.getHours() * 60) + now.getMinutes() + (now.getSeconds() / 60);
        currentScheduleMinutes = curMins;
        const currentMinute = Math.floor(curMins);
        if (followPlayhead && currentMinute !== lastFollowMinute) {
            focusPlayhead();
            lastFollowMinute = currentMinute;
        }

        // Move Playhead
        if (curMins >= START_MINS && curMins <= END_MINS) {
            ui.playhead.style.display = 'block';
            ui.rulerPlayhead.style.display = 'block';
            let pct = ((curMins - START_MINS) / TOTAL_MINS) * 100;
            if (isVerticalTimeline()) {
                ui.playhead.style.top = `${pct}%`;
                ui.playhead.style.left = '';
            } else {
                ui.playhead.style.left = `${pct}%`;
                ui.playhead.style.top = '';
            }
            positionPlayheadBubble();
        } else {
            ui.playhead.style.display = 'none';
            ui.rulerPlayhead.style.display = 'none';
        }

        // Current Block Info
        let activeBlock = currentLayout.find(b => curMins >= b.s && curMins < b.e && b.type !== 'empty');
        
        if (curMins < START_MINS) {
            setSummaryName(ui.currPeriod, "BEFORE SCHOOL");
            ui.countdown.textContent = "--:--:--";
        } else if (curMins >= END_MINS || !activeBlock) {
            setSummaryName(ui.currPeriod, "END OF DAY");
            ui.countdown.textContent = "00:00:00";
        } else {
            let displayName = activeBlock.name;
            if (activeBlock.type === 'editable') {
                 displayName = getBlockName(activeBlock);
            }
            setSummaryName(ui.currPeriod, displayName.toUpperCase());
            
            const totalSeconds = activeBlock.e * 60
                - (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds());
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor(totalSeconds % 3600 / 60);
            const seconds = totalSeconds % 60;
            ui.countdown.textContent = [hours, minutes, seconds]
                .map(value => value.toString().padStart(2, '0')).join(':');
        }
        const nextBlock = getNextBlock();
        ui.currPeriod.style.setProperty('--block-color',
            activeBlock && activeBlock.type === 'editable' ? getBlockColor(activeBlock) : '#ffffff');
        setSummaryName(ui.nextPeriod, nextBlock ? getBlockName(nextBlock).toUpperCase() : 'NONE');
        ui.nextPeriod.style.setProperty('--block-color', nextBlock ? getBlockColor(nextBlock) : '#ffffff');
        updateCountdownWindow();
    }

    // Bindings
    ui.btnA.onchange = () => { if (ui.btnA.checked) { isAWeek = true; updateControls(); } };
    ui.btnB.onchange = () => { if (ui.btnB.checked) { isAWeek = false; updateControls(); } };
    ui.btnMin.onclick = () => { isMinDay = !isMinDay; updateControls(); };
    ui.dayOverride.onchange = () => {
        syncDayOverridePicker();
        buildTimeline();
    };

    // Boot
    setFollowing(true);
    updateControls();
    setInterval(updateTick, 1000);
    updateTick();
    setZoom(FOCUS_ZOOM);

    let lastViewportHeight = ui.timelineViewport.clientHeight;
    new ResizeObserver(() => {
        const height = ui.timelineViewport.clientHeight;
        if (height === lastViewportHeight) return;
        lastViewportHeight = height;
        if (isVerticalTimeline()) setZoom(currentZoom);
    }).observe(ui.timelineViewport);

    new ResizeObserver(() => {
        fitSummaryName(ui.currPeriod);
        fitSummaryName(ui.nextPeriod);
    }).observe(document.getElementById('schedule-summary'));

    const summaryNameObserver = new ResizeObserver(entries => {
        entries.forEach(entry => {
            fitSummaryName(entry.target === ui.currPeriod.parentElement ? ui.currPeriod : ui.nextPeriod);
        });
    });
    summaryNameObserver.observe(ui.currPeriod.parentElement);
    summaryNameObserver.observe(ui.nextPeriod.parentElement);

    document.fonts.ready.then(() => {
        fitLiveDate();
        fitSummaryName(ui.currPeriod);
        fitSummaryName(ui.nextPeriod);
        if (!isVerticalTimeline()) fitTimelineBlockText();
        positionPlayheadBubble();
    });

    let lastClockWidth = ui.liveTime.parentElement.clientWidth;
    new ResizeObserver(() => {
        const width = ui.liveTime.parentElement.clientWidth;
        if (width === lastClockWidth) return;
        lastClockWidth = width;
        fitLiveDate();
    }).observe(ui.liveTime.parentElement);

    // Auto-refresh layout at midnight
    setInterval(() => {
        let n = new Date();
        if(n.getHours() === 0 && n.getMinutes() === 0 && n.getSeconds() === 0 && ui.dayOverride.value === "-1") {
            buildTimeline();
        }
    }, 1000);

