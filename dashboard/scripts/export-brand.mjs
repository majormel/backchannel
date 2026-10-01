import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

process.chdir(fileURLToPath(new URL('../', import.meta.url)))
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { BrandMark } = await server.ssrLoadModule('/src/components/layout/BrandMark.tsx')
  const icons = await server.ssrLoadModule('/src/components/ui/icons.tsx')
  const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props))
  const markup = render(BrandMark)
  const body = markup.slice(markup.indexOf('>') + 1, markup.lastIndexOf('</svg>'))
  const opening = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Backchannel" class="brand-mark" fill="none">'
  const css = await readFile('src/styles/brand-mark.css', 'utf8')
  const asset = (name, content) => writeFile('public/brand/' + name + '.svg', content + '\n')

  await asset('backchannel-mark', opening + body + '</svg>')
  await asset('backchannel-mark-animated', opening + '<style>' + css + '</style>' + body + '</svg>')
  await asset('backchannel-app-icon', opening + body + '</svg>')
  // Optical variant for 16px browser tabs: larger arrows, stronger strokes,
  // no decorative layers that turn into noise at favicon size.
  await asset('backchannel-favicon', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" role="img" aria-label="Backchannel"><defs><linearGradient id="glass" x1="2" y1="0" x2="28" y2="32" gradientUnits="userSpaceOnUse"><stop stop-color="#2d5946"/><stop offset="1" stop-color="#0a1711"/></linearGradient></defs><rect x=".5" y=".5" width="31" height="31" rx="9" fill="url(#glass)" stroke="#72bc97" stroke-opacity=".5"/><g stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 10.5h17m-4-4 4 4-4 4" stroke="#d3ffe8"/><path d="M24.5 21.5h-17m4-4-4 4 4 4" stroke="#79f3bb"/></g></svg>')
  await asset('backchannel-flows', render(icons.Flows, { 'aria-label': 'Backchannel flows' }))
  await asset('backchannel-mark-mono', opening + '<rect x="10" y="10" width="76" height="76" rx="24" stroke="currentColor" stroke-width="1.5" opacity=".3"/><path d="M28 37h38m-9-9 9 9-9 9M68 59H30m9-9-9 9 9 9" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></svg>')
  await asset('backchannel-lockup', opening.replace('0 0 96 96', '0 0 400 96') + body + '<text x="106" y="62" fill="#e6f6ee" font-family="Manrope,Avenir Next,sans-serif" font-size="43" font-weight="600" letter-spacing="-1.7">backchannel<tspan fill="#74edb4">.</tspan></text></svg>')

  // Optional contact sheet to review every glyph without adding a production page.
  if (process.argv[2]) {
    const seen = new Set()
    const entries = Object.entries(icons).filter(([, Icon]) => {
      if (!Icon?.$$typeof || seen.has(Icon)) return false
      seen.add(Icon)
      return true
    })
    const columns = 8
    const height = 178 + Math.ceil(entries.length / columns) * 105
    let sheet = '<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="' + height + '" viewBox="0 0 1040 ' + height + '"><rect width="1040" height="' + height + '" rx="24" fill="#0b100e"/><g font-family="Arial,sans-serif">'
    sheet += '<text x="40" y="46" fill="#77eabb" font-size="10" letter-spacing="3">BACKCHANNEL / ICON SYSTEM</text><text x="40" y="88" fill="#eaf6ef" font-size="30" letter-spacing="-1">One language. Every action.</text><text x="40" y="116" fill="#94a69c" font-size="12">Custom 24px geometry · consistent strokes · subtle secondary layers</text>'
    sheet += markup.replace('<svg ', '<svg x="912" y="26" width="80" height="80" ')
    entries.forEach(([name, Icon], index) => {
      const x = 40 + (index % columns) * 121
      const y = 145 + Math.floor(index / columns) * 105
      const drawing = render(Icon, { width: 30, height: 30, x: x + 39, y: y + 18, color: '#98edc1' })
      sheet += '<rect x="' + x + '" y="' + y + '" width="109" height="91" rx="12" fill="#101a15" stroke="#26352c"/>' + drawing
      sheet += '<text x="' + (x + 54.5) + '" y="' + (y + 71) + '" text-anchor="middle" fill="#a7b8ae" font-size="9">' + name + '</text>'
    })
    sheet += '</g></svg>'
    await writeFile(process.argv[2], sheet)
    console.log('Rendered ' + entries.length + ' unique glyphs for visual review')
  }
  console.log('Updated all seven brand SVG assets')
} finally {
  await server.close()
}
