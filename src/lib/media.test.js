import { srtToVtt } from './media'

describe('subtitles', () => {
  it('converts SRT to VTT', () => {
    const vtt = srtToVtt('1\n00:00:01,000 --> 00:00:02,500\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld\n')
    expect(vtt.startsWith('WEBVTT')).toBe(true)
    expect(vtt).toContain('00:00:01.000 --> 00:00:02.500')
    expect(vtt).not.toMatch(/^1$/m)
  })
})
