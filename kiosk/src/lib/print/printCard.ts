/**
 * Prints the rendered card on 4x6" paper.
 *
 * On the kiosk, Chrome runs with --kiosk-printing: window.print() then goes straight to the
 * DEFAULT printer with no dialog. Make the DNP DS-RX1HS (or HiTi P525L) the Windows default
 * printer with paper "4x6 / PC" and borderless on. See deploy/windows/README.md.
 *
 * The page contains a hidden #print-root holding only the card image; @media print hides
 * everything else (see index.css), and @page sets the 4in x 6in sheet with zero margins.
 */
export async function printCard(cardDataUrl: string): Promise<void> {
  let root = document.getElementById('print-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'print-root'
    document.body.appendChild(root)
  }
  root.innerHTML = ''
  const img = new Image()
  img.alt = ''
  img.src = cardDataUrl
  root.appendChild(img)
  await img.decode().catch(() => undefined)

  await new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      window.removeEventListener('afterprint', finish)
      resolve()
    }
    window.addEventListener('afterprint', finish)
    // window.print() blocks while a dialog is open (dev); in kiosk-printing mode it returns at once.
    setTimeout(() => {
      window.print()
      setTimeout(finish, 1500)
    }, 50)
  })
}
