import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

export async function exportToPDF(elementId: string, filename: string): Promise<void> {
  const el = document.getElementById(elementId)
  if (!el) throw new Error(`Element #${elementId} not found`)

  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
  const imgData = canvas.toDataURL('image/png')

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 10
  const contentW = pageW - margin * 2
  const imgH = (canvas.height * contentW) / canvas.width

  let yPos = margin
  let heightLeft = imgH

  pdf.addImage(imgData, 'PNG', margin, yPos, contentW, imgH)
  heightLeft -= pageH - margin * 2

  while (heightLeft > 0) {
    yPos = heightLeft - imgH + margin
    pdf.addPage()
    pdf.addImage(imgData, 'PNG', margin, yPos, contentW, imgH)
    heightLeft -= pageH - margin * 2
  }

  pdf.save(`${filename}.pdf`)
}
