' Excel/Calc -> PDF conversion macro.
'
' ---------------------------------------------------------------------------
' WHY THIS FILE EXISTS AT ALL
' ---------------------------------------------------------------------------
'
' The sibling services (word-to-pdf, powerpoint-to-pdf) need no macro. They
' invoke `soffice --convert-to pdf:writer_pdf_Export` and are done, because a
' .docx and a .pptx each already carry the page geometry they should be
' rendered at — a page size, a slide size. "Convert to PDF" is unambiguous.
'
' A spreadsheet carries no such thing. A sheet is an unbounded grid, and
' something has to decide where that grid is cut into fixed rectangles. The
' command line cannot express that decision: `--convert-to pdf` accepts no
' scaling or orientation argument, so it falls through to whatever the
' document's page style says, which for a workbook that was never set up for
' printing means Calc's default — portrait, 100% scale, columns sliced into
' page-width strips.
'
' That default is what produces the single most-complained-about output in this
' whole category: an ordinary 12-column budget comes back as a 4-page PDF with
' columns 9-12 orphaned onto their own sheet, stripped of the row labels that
' made them mean anything. The fix has to be applied to the document's page
' styles before export, and the only interface LibreOffice exposes for that in
' headless mode is a Basic macro. Hence this file.
'
' See src/lib/excelToPdfLimits.js for the option contract and the reasoning
' behind each default (notably: fit-width rather than fit-page, and auto
' orientation resolving to landscape rather than portrait).
'
' ---------------------------------------------------------------------------
' HOW IT IS CALLED
' ---------------------------------------------------------------------------
'
' soffice ... macro:///Standard.Convert.ConvertToPdf(in, out, scaling, orient, sheets)
'
' Every argument is passed positionally by server.mjs. The three option
' arguments are guaranteed to be one of a dozen fixed tags, because the route
' runs them through normalizeOptions() before they ever reach the wire and
' server.mjs re-validates them against its own copy of the lists — so nothing
' here has to escape or sanitise them. That guarantee is load-bearing: these
' values are interpolated into a macro invocation, and the reason that is safe
' is the allowlist at both ends, not anything this file does.
'
' ---------------------------------------------------------------------------
' THE STDOUT CONTRACT
' ---------------------------------------------------------------------------
'
' This macro communicates its result by writing a single token to a status file
' whose path is derived from the output path, NOT by its exit code and NOT via
' stdout. Two reasons, both learned from the sibling services:
'
'   - soffice exits 0 having produced nothing, routinely. The exit code is not
'     the success signal on any of these services (see server.mjs), so adding a
'     macro does not make it one.
'   - soffice's stdout carries LibreOffice's own chatter, which is exactly the
'     trap documented in services/pdf-to-word/convert.py: a log line gets read
'     as the result token. A dedicated file has no such ambiguity.
'
' server.mjs still treats the presence of a real PDF as the authoritative
' success signal. The status file only distinguishes *why* a conversion
' produced nothing — an empty workbook is a different message from a damaged
' one, and without this the user gets "conversion failed" for a file that is
' not damaged at all.

Sub ConvertToPdf(sInputUrl As String, sOutputUrl As String, sScaling As String, sOrientation As String, sSheets As String)
    Dim oDesktop As Object
    Dim oDoc As Object
    Dim oArgs(2) As New com.sun.star.beans.PropertyValue
    Dim oExportArgs(1) As New com.sun.star.beans.PropertyValue
    Dim sStatus As String

    sStatus = "convert_failed"

    On Error GoTo Failed

    ' Hidden, read-only, and with macro execution left at the service's
    ' configured level. A workbook is untrusted input arriving from the
    ' internet; opening it read-only means nothing we do can write back to the
    ' user's file, and hidden keeps a headless process from trying to realise a
    ' window it has no display for.
    oArgs(0).Name = "Hidden"
    oArgs(0).Value = True
    oArgs(1).Name = "ReadOnly"
    oArgs(1).Value = True
    ' Suppresses the "update links?" and "this file is in a foreign format"
    ' prompts. Without it a workbook with external references hangs headless
    ' soffice waiting for an answer that will never come, until the kill timeout
    ' fires — which surfaces to the user as an unexplained timeout on a file
    ' that was fine.
    oArgs(2).Name = "UpdateDocMode"
    oArgs(2).Value = com.sun.star.document.UpdateDocMode.NO_UPDATE

    oDesktop = createUnoService("com.sun.star.frame.Desktop")
    oDoc = oDesktop.loadComponentFromURL(sInputUrl, "_blank", 0, oArgs())

    If IsNull(oDoc) Then
        sStatus = "unreadable"
        GoTo Finish
    End If

    ' A workbook with no sheets at all is not something Excel can produce, but
    ' a damaged file can present as one — and exporting it yields a zero-page
    ' PDF rather than an error.
    '
    ' This also doubles as the check that what loaded is actually a spreadsheet:
    ' .Sheets does not exist on a Writer or Impress document, so a non-Calc file
    ' raises here and lands in the Failed handler as convert_failed. That is the
    ' correct outcome and not a gap — the route and server.mjs both refuse
    ' non-spreadsheets by magic bytes long before this point, so reaching here
    ' with one means something upstream is broken rather than that a user needs
    ' better advice.
    If oDoc.Sheets.Count = 0 Then
        sStatus = "no_content"
        GoTo CloseAndFinish
    End If

    ApplyPageSetup(oDoc, sScaling, sOrientation)

    If sSheets = "first" Then
        SelectFirstSheetOnly(oDoc)
    End If

    ' The Calc PDF exporter named explicitly, for the same reason the Impress
    ' service names impress_pdf_Export: a bare "pdf" filter lets LibreOffice
    ' choose from the input type, and a wrong choice reflows the document
    ' through another module's exporter and destroys the layout.
    oExportArgs(0).Name = "FilterName"
    oExportArgs(0).Value = "calc_pdf_Export"
    oExportArgs(1).Name = "Overwrite"
    oExportArgs(1).Value = True

    oDoc.storeToURL(sOutputUrl, oExportArgs())

    sStatus = "ok"

CloseAndFinish:
    If Not IsNull(oDoc) Then
        oDoc.close(False)
    End If

Finish:
    WriteStatus(sOutputUrl, sStatus)
    ' Terminating explicitly rather than letting the process linger. Without
    ' this, soffice invoked with a macro URL stays resident after the macro
    ' returns, and the per-request process never exits until the kill timeout —
    ' which would serialise every conversion behind a 55-second wait.
    createUnoService("com.sun.star.frame.Desktop").terminate()
    Exit Sub

Failed:
    ' Basic's error object is the only detail available here. It is inspected
    ' for the one distinction that changes what the user should do: a
    ' password-protected file is a fact about their workbook, not a fault on
    ' our side, and telling them "conversion failed" when the answer is "remove
    ' the password" is a dead end.
    If InStr(LCase(Error$), "password") > 0 Then
        sStatus = "encrypted"
    ElseIf InStr(LCase(Error$), "encrypt") > 0 Then
        sStatus = "encrypted"
    Else
        sStatus = "convert_failed"
    End If

    Resume CloseAndFinish
End Sub

' Applies the scaling and orientation choice to every page style in the
' document.
'
' Every page style, not just the active one: a workbook can carry a different
' page style per sheet (Excel's per-sheet page setup maps onto exactly that),
' and setting only the default leaves the other sheets exporting at Calc's
' defaults. That is the bug where "it worked for sheet 1 and not sheet 3",
' which is far harder to diagnose from a user report than a uniform failure.
Sub ApplyPageSetup(oDoc As Object, sScaling As String, sOrientation As String)
    Dim oStyles As Object
    Dim oStyle As Object
    Dim i As Integer
    Dim bLandscape As Boolean
    Dim nWidth As Long
    Dim nHeight As Long

    ' "original" means: use the print setup already saved in the workbook.
    ' Someone who has configured print areas, scaling, and page breaks in Excel
    ' wants exactly that, and overriding it would silently discard deliberate
    ' work. So this returns before touching anything.
    If sScaling = "original" And sOrientation = "auto" Then
        Exit Sub
    End If

    oStyles = oDoc.StyleFamilies.getByName("PageStyles")

    For i = 0 To oStyles.Count - 1
        oStyle = oStyles.getByIndex(i)

        ' ---- Orientation ----
        '
        ' "auto" is deliberately not a synonym for portrait. Spreadsheets are
        ' predominantly wider than they are tall, so auto resolves to landscape
        ' unless the workbook already says landscape (in which case there is
        ' nothing to change). Forcing portrait on a wide sheet is the other half
        ' of the orphaned-columns problem: even at fit-width, a 15-column sheet
        ' squeezed into portrait scales down far enough to be unreadable.
        If sOrientation <> "auto" Or sScaling <> "original" Then
            bLandscape = True

            If sOrientation = "portrait" Then
                bLandscape = False
            ElseIf sOrientation = "auto" Then
                ' Respect an explicit landscape already set in the workbook;
                ' otherwise default wide.
                bLandscape = True
            End If

            ' IsLandscape is a flag, not a transform — setting it does NOT swap
            ' the page dimensions, and a page style left at portrait width with
            ' IsLandscape=True exports as a portrait page that merely claims to
            ' be landscape. The width/height have to be swapped by hand, which
            ' is the kind of thing that looks redundant until the output is
            ' wrong in a way nothing explains.
            nWidth = oStyle.Width
            nHeight = oStyle.Height

            If bLandscape And nHeight > nWidth Then
                oStyle.IsLandscape = True
                oStyle.Width = nHeight
                oStyle.Height = nWidth
            ElseIf (Not bLandscape) And nWidth > nHeight Then
                oStyle.IsLandscape = False
                oStyle.Width = nHeight
                oStyle.Height = nWidth
            Else
                oStyle.IsLandscape = bLandscape
            End If
        End If

        ' ---- Scaling ----
        '
        ' The scaling properties are mutually exclusive in effect, and
        ' LibreOffice honours whichever was set last — so each branch sets its
        ' own and explicitly clears the others. Leaving a stale PageScale on a
        ' style that also has ScaleToPagesX produces a document scaled twice.
        '
        ' Every write goes through SetIfSupported rather than being assigned
        ' directly, and that is not defensive padding. ScaleToPagesX and
        ' ScaleToPagesY were added to TablePageStyle later than ScaleToPages,
        ' so on an older LibreOffice a direct assignment raises a Basic error —
        ' which the handler in ConvertToPdf would turn into a "conversion
        ' failed" for a workbook that is perfectly fine. Skipping an
        ' unsupported property instead degrades to the next-best pagination,
        ' which is the right failure for a cosmetic setting.
        If sScaling = "fit-width" Then
            ' Cap the horizontal axis at one page and let rows flow down as many
            ' pages as they need. This is the whole point of the tool's default:
            ' it fixes orphaned columns without shrinking a 500-row ledger into
            ' illegibility, which is what fit-page would do.
            SetIfSupported(oStyle, "PageScale", 0)      ' 0 disables fixed-% scaling
            SetIfSupported(oStyle, "ScaleToPages", 0)   ' clear any whole-doc fit
            SetIfSupported(oStyle, "ScaleToPagesY", 0)  ' 0 = rows unconstrained
            ' Set last, so it wins if the build honours whichever was written
            ' most recently.
            SetIfSupported(oStyle, "ScaleToPagesX", 1)
        ElseIf sScaling = "fit-page" Then
            ' Everything onto one sheet of paper. Offered because it is
            ' genuinely what people want for a small summary table, and warned
            ' about in the UI because on a large sheet it produces text nobody
            ' can read.
            SetIfSupported(oStyle, "PageScale", 0)
            SetIfSupported(oStyle, "ScaleToPagesX", 0)
            SetIfSupported(oStyle, "ScaleToPagesY", 0)
            SetIfSupported(oStyle, "ScaleToPages", 1)
        End If
    Next i
End Sub

' Writes a property only if the page style actually exposes it.
'
' hasPropertyByName is the check rather than a try/ignore, because swallowing
' errors here would also swallow a genuine failure — and this runs inside a Sub
' whose caller treats any error as a failed conversion. See the note at the
' scaling block for which properties are version-dependent and why skipping one
' is better than refusing the file.
Sub SetIfSupported(oStyle As Object, sName As String, vValue As Variant)
    On Error Resume Next

    If oStyle.getPropertySetInfo().hasPropertyByName(sName) Then
        oStyle.setPropertyValue(sName, vValue)
    End If
End Sub

' Restricts the export to the first sheet.
'
' Worth having because a workbook is a container of sheets in a way a document
' is not a container of documents: real workbooks carry working sheets, lookup
' tables, and raw data dumps alongside the one sheet anybody wants to send.
'
' Implemented by selecting rather than by deleting the other sheets. Deleting
' would be simpler, but a formula on sheet 1 that references sheet 2 would then
' export as #REF! — turning a "just send the summary" request into a PDF full
' of errors. Selection leaves every value intact.
Sub SelectFirstSheetOnly(oDoc As Object)
    Dim oSheet As Object
    Dim oController As Object

    oController = oDoc.getCurrentController()
    oSheet = oDoc.Sheets.getByIndex(0)
    oController.setActiveSheet(oSheet)
    oController.select(oSheet)
End Sub

' Writes the result token beside the output file.
'
' A separate file rather than stdout, for the reason in the header comment:
' LibreOffice writes its own chatter to stdout, and services/pdf-to-word learned
' the hard way that a log line will eventually be read as the result token.
Sub WriteStatus(sOutputUrl As String, sStatus As String)
    Dim iFile As Integer
    Dim sPath As String

    On Error Resume Next

    sPath = sOutputUrl & ".status"
    iFile = FreeFile
    Open sPath For Output As #iFile
    Print #iFile, sStatus
    Close #iFile
End Sub
