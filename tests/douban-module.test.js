import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validateModule } from '../tools/validate-module.js'

const file = fileURLToPath(
  new URL('../modules/douban-easylistchina-test.sgmodule', import.meta.url),
)
const source = readFileSync(file, 'utf8')
const patterns = source
  .split(/\r?\n/)
  .filter((line) => line.startsWith('URL-REGEX,'))
  .map((line) => new RegExp(line.slice('URL-REGEX,'.length, -',REJECT'.length)))

describe('Douban test module', () => {
  it('uses valid module syntax and exactly four URL rules', () => {
    expect(validateModule(source, file)).toEqual([])
    expect(patterns).toHaveLength(4)
  })

  it.each([
    [
      0,
      'https://douban.com/?unit=dale_movie_trailer_after_play&id=1',
      'https://douban.com/?unit=dale_movie_trailer_after_play',
    ],
    [
      1,
      'https://movie.douban.com/view/dale-online/dale_ad',
      'https://movie.douban.com/view/other/dale_ad',
    ],
    [2, 'https://douban.com/x/fm_bgad.js', 'https://douban.com/fm_bgad.js'],
    [
      3,
      'https://img.doubanio.com/x/js/ad.png',
      'https://img.doubanio.com/js/ad.png',
    ],
  ])('matches intended URL %i without expanding its path', (index, yes, no) => {
    expect(patterns[index].test(yes)).toBe(true)
    expect(patterns[index].test(no)).toBe(false)
    expect(
      patterns[index].test(
        yes
          .replace('douban.com', 'notdouban.com')
          .replace('doubanio.com', 'notdoubanio.com'),
      ),
    ).toBe(false)
  })
})
