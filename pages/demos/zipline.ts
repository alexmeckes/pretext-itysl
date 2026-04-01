import {
  layoutNextLine,
  layoutWithLines,
  prepareWithSegments,
  walkLineRanges,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from '../../src/layout.ts'
import timGeminiCutoutUrl from '../assets/tim-zipline-gemini-cutout.png'
import { BODY_TEXT, DEK_TEXT, HEADLINE_TEXT } from './zipline-copy.ts'
import {
  carveTextLineSlots,
  getPolygonIntervalForBand,
  transformWrapPoints,
  type Interval,
  type Point,
  type Rect,
} from './wrap-geometry.ts'

const BODY_FONT = '17px "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, serif'
const BODY_LINE_HEIGHT = 26
const DEK_FONT = '500 16px/1.4 "Helvetica Neue", Helvetica, Arial, sans-serif'
const DEK_LINE_HEIGHT = 24
const HEADLINE_FONT_FAMILY = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, serif'
const LOOP_MS = 7_200
const TIM_WRAP_HULL_POINTS: Point[] = [
  { x: 0.425, y: 0.045 },
  { x: 0.392, y: 0.060 },
  { x: 0.372, y: 0.095 },
  { x: 0.360, y: 0.145 },
  { x: 0.360, y: 0.225 },
  { x: 0.372, y: 0.335 },
  { x: 0.386, y: 0.470 },
  { x: 0.396, y: 0.610 },
  { x: 0.400, y: 0.720 },
  { x: 0.384, y: 0.810 },
  { x: 0.336, y: 0.925 },
  { x: 0.296, y: 0.992 },
  { x: 0.348, y: 1.000 },
  { x: 0.415, y: 0.975 },
  { x: 0.462, y: 0.900 },
  { x: 0.486, y: 0.850 },
  { x: 0.500, y: 0.845 },
  { x: 0.514, y: 0.850 },
  { x: 0.538, y: 0.900 },
  { x: 0.585, y: 0.975 },
  { x: 0.652, y: 1.000 },
  { x: 0.704, y: 0.992 },
  { x: 0.664, y: 0.925 },
  { x: 0.616, y: 0.810 },
  { x: 0.600, y: 0.720 },
  { x: 0.604, y: 0.610 },
  { x: 0.614, y: 0.470 },
  { x: 0.628, y: 0.335 },
  { x: 0.640, y: 0.225 },
  { x: 0.640, y: 0.145 },
  { x: 0.628, y: 0.095 },
  { x: 0.608, y: 0.060 },
  { x: 0.575, y: 0.045 },
]

type PositionedLine = {
  x: number
  y: number
  width: number
  text: string
}

type WrapObstacle = {
  points: Point[]
  insetX: number
  insetY: number
}

type BodyTextEffect = {
  centerX: number
  centerY: number
  radiusX: number
  radiusY: number
}

type Projection = {
  headlineFont: string
  headlineLines: PositionedLine[]
  dekFont: string
  dekLines: PositionedLine[]
  bodyFont: string
  bodyLines: PositionedLine[]
  cableLeft: number
  cableTop: number
  cableLength: number
  cableAngle: number
  timRect: Rect
  timAngle: number
}

type DomCache = {
  cable: HTMLDivElement
  tim: HTMLDivElement
  headlineLines: HTMLSpanElement[]
  dekLines: HTMLSpanElement[]
  bodyLines: HTMLSpanElement[]
}

function getRequiredDiv(id: string): HTMLDivElement {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLDivElement)) throw new Error(`#${id} not found`)
  return element
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function syncPool<T extends HTMLElement>(pool: T[], count: number, create: () => T): void {
  while (pool.length < count) {
    const element = create()
    stage.appendChild(element)
    pool.push(element)
  }
  for (let index = 0; index < pool.length; index++) {
    pool[index]!.style.display = index < count ? '' : 'none'
  }
}

const stage = getRequiredDiv('stage')
const preparedByKey = new Map<string, PreparedTextWithSegments>()

function getPrepared(text: string, font: string, whiteSpace: 'normal' | 'pre-wrap' = 'normal'): PreparedTextWithSegments {
  const key = `${font}::${whiteSpace}::${text}`
  const cached = preparedByKey.get(key)
  if (cached !== undefined) return cached
  const prepared = prepareWithSegments(text, font, { whiteSpace })
  preparedByKey.set(key, prepared)
  return prepared
}

let preparedBody!: PreparedTextWithSegments
let preparedDek!: PreparedTextWithSegments

let cachedHeadlineWidth = -1
let cachedHeadlineHeight = -1
let cachedHeadlineMaxSize = -1
let cachedHeadlineFontSize = 24
let cachedHeadlineLines: PositionedLine[] = []

function fitHeadline(maxWidth: number, maxHeight: number, maxSize: number): { fontSize: number, lines: PositionedLine[] } {
  if (
    maxWidth === cachedHeadlineWidth &&
    maxHeight === cachedHeadlineHeight &&
    maxSize === cachedHeadlineMaxSize
  ) {
    return { fontSize: cachedHeadlineFontSize, lines: cachedHeadlineLines }
  }

  cachedHeadlineWidth = maxWidth
  cachedHeadlineHeight = maxHeight
  cachedHeadlineMaxSize = maxSize

  let lo = 26
  let hi = maxSize
  let best = lo
  let bestLines: PositionedLine[] = []

  while (lo <= hi) {
    const size = Math.floor((lo + hi) / 2)
    const font = `700 ${size}px ${HEADLINE_FONT_FAMILY}`
    const lineHeight = Math.round(size * 0.92)
    const prepared = getPrepared(HEADLINE_TEXT, font)
    let breaksInsideWord = false
    let lineCount = 0

    walkLineRanges(prepared, maxWidth, line => {
      lineCount++
      if (line.end.graphemeIndex !== 0) breaksInsideWord = true
    })

    if (!breaksInsideWord && lineCount * lineHeight <= maxHeight) {
      best = size
      bestLines = layoutWithLines(prepared, maxWidth, lineHeight).lines.map((line, index) => ({
        x: 0,
        y: index * lineHeight,
        width: line.width,
        text: line.text,
      }))
      lo = size + 1
    } else {
      hi = size - 1
    }
  }

  cachedHeadlineFontSize = best
  cachedHeadlineLines = bestLines
  return { fontSize: best, lines: bestLines }
}

function createLine(className: string): HTMLSpanElement {
  const element = document.createElement('span')
  element.className = className
  return element
}

function createDiv(className: string, text: string = ''): HTMLDivElement {
  const element = document.createElement('div')
  element.className = className
  element.textContent = text
  return element
}

function createTim(): HTMLDivElement {
  const element = document.createElement('div')
  element.className = 'tim'
  element.setAttribute('aria-hidden', 'true')
  element.style.backgroundImage = `url(${timGeminiCutoutUrl})`
  return element
}

const domCache: DomCache = {
  cable: createDiv('zipline-cable'),
  tim: createTim(),
  headlineLines: [],
  dekLines: [],
  bodyLines: [],
}

stage.append(
  domCache.cable,
  domCache.tim,
)

await document.fonts.ready
preparedBody = getPrepared(BODY_TEXT, BODY_FONT, 'pre-wrap')
preparedDek = getPrepared(DEK_TEXT, DEK_FONT)
const timAspect = 1

function layoutLinesAroundObstacles(
  prepared: PreparedTextWithSegments,
  boxLeft: number,
  boxTop: number,
  boxWidth: number,
  boxHeight: number,
  lineHeight: number,
  obstacles: WrapObstacle[],
): { lines: PositionedLine[], complete: boolean } {
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let lineTop = boxTop
  let done = false
  const lines: PositionedLine[] = []

  while (lineTop + lineHeight <= boxTop + boxHeight && !done) {
    const bandTop = lineTop
    const bandBottom = lineTop + lineHeight
    const blocked: Interval[] = []
    for (const obstacle of obstacles) {
      const interval = getPolygonIntervalForBand(
        obstacle.points,
        bandTop,
        bandBottom,
        obstacle.insetX,
        obstacle.insetY,
      )
      if (interval !== null) blocked.push(interval)
    }

    const slots = carveTextLineSlots({ left: boxLeft, right: boxLeft + boxWidth }, blocked)
    if (slots.length === 0) {
      lineTop += lineHeight
      continue
    }

    const orderedSlots = [...slots].sort((a, b) => a.left - b.left)
    for (let index = 0; index < orderedSlots.length; index++) {
      const slot = orderedSlots[index]!
      const line = layoutNextLine(prepared, cursor, slot.right - slot.left)
      if (line === null) {
        done = true
        break
      }
      lines.push({
        x: Math.round(slot.left),
        y: Math.round(lineTop),
        width: line.width,
        text: line.text,
      })
      cursor = line.end
    }

    lineTop += lineHeight
  }

  return { lines, complete: done }
}

function layoutBodyLines(
  prepared: PreparedTextWithSegments,
  bodyLeft: number,
  bodyTop: number,
  bodyWidth: number,
  bodyHeight: number,
  bodyObstacle: Point[],
  wakeObstacle: Point[],
): PositionedLine[] {
  return layoutLinesAroundObstacles(
    prepared,
    bodyLeft,
    bodyTop,
    bodyWidth,
    bodyHeight,
    BODY_LINE_HEIGHT,
    [
      { points: wakeObstacle, insetX: 34, insetY: 22 },
      { points: bodyObstacle, insetX: 20, insetY: 10 },
    ],
  ).lines
}

function projectLines(
  pool: HTMLSpanElement[],
  lines: PositionedLine[],
  font: string,
  bodyEffect?: BodyTextEffect,
): void {
  syncPool(pool, lines.length, () => createLine(pool === domCache.headlineLines ? 'headline-line' : pool === domCache.dekLines ? 'dek-line' : 'body-line'))
  for (let index = 0; index < lines.length; index++) {
    const element = pool[index]!
    const line = lines[index]!
    element.textContent = line.text
    element.style.left = `${line.x}px`
    element.style.top = `${line.y}px`
    element.style.width = `${Math.ceil(line.width)}px`
    element.style.font = font
    if (pool === domCache.bodyLines && bodyEffect !== undefined) {
      const lineCenterX = line.x + line.width * 0.5
      const lineCenterY = line.y + BODY_LINE_HEIGHT * 0.5
      const verticalForce = clamp(1 - Math.abs(lineCenterY - bodyEffect.centerY) / bodyEffect.radiusY, 0, 1)
      const horizontalForce = clamp(1 - Math.abs(lineCenterX - bodyEffect.centerX) / bodyEffect.radiusX, 0, 1)
      const force = verticalForce * (0.6 + horizontalForce * 0.4)
      const direction = lineCenterX < bodyEffect.centerX ? -1 : 1
      const push = Math.round(direction * force * 10)
      element.style.transform = `translateX(${push}px)`
      element.style.letterSpacing = `${(force * 0.018).toFixed(3)}em`
      element.style.opacity = `${(0.85 + (1 - force) * 0.11).toFixed(3)}`
    } else {
      element.style.transform = ''
      element.style.letterSpacing = ''
      element.style.opacity = ''
    }
  }
}

function render(now: number): void {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const gutter = clamp(Math.round(viewportWidth * 0.055), 20, 72)
  const topInset = clamp(Math.round(viewportHeight * 0.07), 28, 74)

  const headlineWidth = Math.min(viewportWidth - gutter * 2, 980)
  const headlineMaxHeight = Math.round(viewportHeight * 0.24)
  const headlineMaxSize = viewportWidth < 720 ? 64 : 118
  const { fontSize: headlineSize, lines: rawHeadlineLines } = fitHeadline(headlineWidth, headlineMaxHeight, headlineMaxSize)
  const headlineLineHeight = Math.round(headlineSize * 0.92)
  const headlineFont = `700 ${headlineSize}px ${HEADLINE_FONT_FAMILY}`
  const headlineLeft = gutter
  const headlineTop = topInset + 22
  const progress = (now % LOOP_MS) / LOOP_MS
  const stagedProgress = easeInOutCubic(progress)
  const bodyWidth = viewportWidth - gutter * 2
  const pathStartX = gutter + bodyWidth * 0.68
  const pathStartY = topInset - 8
  const pathEndX = gutter + bodyWidth * 0.49
  const pathEndY = Math.min(viewportHeight * 0.84, viewportHeight - 104)
  const baseTimWidth = clamp(Math.round(viewportWidth * 0.19), 170, 270)
  const timWidth = Math.round(baseTimWidth * lerp(0.82, 1.3, stagedProgress))
  const timHeight = Math.round(timWidth / timAspect)
  const timCenterX = lerp(pathStartX, pathEndX, stagedProgress) + Math.sin(progress * Math.PI * 7) * 3.5
  const timCenterY = lerp(pathStartY, pathEndY, stagedProgress) + Math.sin(progress * Math.PI * 9) * 3
  const timAngle = -0.02 + stagedProgress * 0.022 + Math.sin(progress * Math.PI * 5) * 0.004
  const timRect: Rect = {
    x: timCenterX - timWidth * 0.5,
    y: timCenterY - timHeight * 0.38,
    width: timWidth,
    height: timHeight,
  }
  const travelAngle = Math.atan2(pathEndY - pathStartY, pathEndX - pathStartX)
  const obstacle = transformWrapPoints(TIM_WRAP_HULL_POINTS, timRect, timAngle)
  const wakeOffsetX = Math.cos(travelAngle) * timWidth * 0.12
  const wakeOffsetY = Math.sin(travelAngle) * timWidth * 0.12
  const wakeRect: Rect = {
    x: timRect.x - timWidth * 0.16 + wakeOffsetX,
    y: timRect.y - timHeight * 0.10 + wakeOffsetY,
    width: timWidth * 1.34,
    height: timHeight * 1.18,
  }
  const wakeObstacle = transformWrapPoints(TIM_WRAP_HULL_POINTS, wakeRect, timAngle)
  const cableAttach = transformWrapPoints([{ x: 0.49, y: 0.045 }], timRect, timAngle)[0]!
  const cableStartY = topInset - 10
  const distanceToTop = (cableAttach.y - cableStartY) / Math.sin(travelAngle)
  const cableStartX = cableAttach.x - Math.cos(travelAngle) * distanceToTop
  const cableAngle = travelAngle
  const cableLength = Math.hypot(cableAttach.x - cableStartX, cableAttach.y - cableStartY)

  const headlineLines = rawHeadlineLines.map(line => ({
    x: headlineLeft,
    y: headlineTop + line.y,
    width: line.width,
    text: line.text,
  }))

  const headlineBottom = headlineTop + rawHeadlineLines.length * headlineLineHeight

  const dekWidth = Math.min(Math.round(headlineWidth * 0.62), 560)
  const dekLeft = gutter
  const dekTop = headlineBottom + 18
  const dekFont = DEK_FONT
  const dekLines = layoutWithLines(preparedDek, dekWidth, DEK_LINE_HEIGHT).lines.map((line, index) => ({
    x: dekLeft,
    y: dekTop + index * DEK_LINE_HEIGHT,
    width: line.width,
    text: line.text,
  }))

  const bodyTop = dekTop + dekLines.length * DEK_LINE_HEIGHT + 34
  const bodyLeft = gutter
  const bodyHeight = Math.max(120, viewportHeight - bodyTop - 46)

  const bodyLines = layoutBodyLines(preparedBody, bodyLeft, bodyTop, bodyWidth, bodyHeight, obstacle, wakeObstacle)

  const projection: Projection = {
    headlineFont,
    headlineLines,
    dekFont,
    dekLines,
    bodyFont: BODY_FONT,
    bodyLines,
    cableLeft: cableStartX,
    cableTop: cableStartY,
    cableLength,
    cableAngle,
    timRect,
    timAngle,
  }

  projectLines(domCache.headlineLines, projection.headlineLines, projection.headlineFont)
  projectLines(domCache.dekLines, projection.dekLines, projection.dekFont)
  projectLines(domCache.bodyLines, projection.bodyLines, projection.bodyFont, {
    centerX: timCenterX,
    centerY: timRect.y + timRect.height * 0.54,
    radiusX: timRect.width * 1.45,
    radiusY: timRect.height * 1.1,
  })

  domCache.cable.style.left = `${projection.cableLeft}px`
  domCache.cable.style.top = `${projection.cableTop}px`
  domCache.cable.style.width = `${projection.cableLength}px`
  domCache.cable.style.transform = `rotate(${projection.cableAngle}rad)`

  domCache.tim.style.left = `${projection.timRect.x}px`
  domCache.tim.style.top = `${projection.timRect.y}px`
  domCache.tim.style.width = `${projection.timRect.width}px`
  domCache.tim.style.height = `${projection.timRect.height}px`
  domCache.tim.style.opacity = '1'
  domCache.tim.style.transform = `rotate(${projection.timAngle}rad)`

  requestAnimationFrame(render)
}

requestAnimationFrame(render)
