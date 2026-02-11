import PDFDocument from 'pdfkit';
import fs from 'fs';

async function testPDF() {
    try {
        const period = 'today';
        const rows = [
            { type: 'income', amount: 15000000, description: 'Oylik', created_at: '2026-02-11T08:00:00' },
            { type: 'expense', amount: 1600000, description: 'Ikkni xaridni', created_at: '2026-02-11T09:00:00' },
            { type: 'expense', amount: 2000000, description: 'kompyuter', created_at: '2026-02-11T10:00:00' },
            { type: 'expense', amount: 3000000, description: 'o\'rkin', created_at: '2026-02-11T11:00:00' },
            { type: 'income', amount: 6000000, description: 'Ustb haqqi o\'tkn', created_at: '2026-02-11T12:00:00' }
        ];

        const totalInc = 21000000;
        const totalExp = 6600000;
        const startDate = '2026-02-11';
        const endDate = '2026-02-11';
        const startingBalance = 0;
        const user = { username: 'test_user' };
        const balance = totalInc - totalExp;

        const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
        doc.pipe(fs.createWriteStream('test_final_polished_v2.pdf'));

        // 1. Header
        doc.fontSize(22).font('Helvetica-Bold').fillColor('#1e293b').text('Moliya Hisoboti', { align: 'center' });
        doc.moveDown(0.3);
        doc.strokeColor('#cbd5e1').lineWidth(2).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.5);

        // 2. Period & User Info
        doc.fillColor('#64748b').fontSize(10).font('Helvetica').text(`Davr: ${startDate} - ${endDate}`, 40, doc.y);
        doc.fontSize(9).text(`Foydalanuvchi: Adhamov Muhammadsodiq`, 40, doc.y + 3);
        doc.moveDown(1.2);

        // 3. Summary Cards (Full Width)
        const cardY = doc.y;
        // Available width = 515pt. Gaps = 15pt * 2 = 30pt. Cards = (515 - 30) / 3 = 161.6
        const cardWidth = 160;
        const cardGap = 17;
        const cardHeight = 70;
        const cardRadius = 8;

        // Card X Positions
        const card1X = 40;
        const card2X = 40 + cardWidth + cardGap;
        const card3X = 40 + (cardWidth + cardGap) * 2;

        function drawCard(x, color, title, amount) {
            doc.roundedRect(x, cardY, cardWidth, cardHeight, cardRadius).fillAndStroke(color, color);
            doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text(title, x, cardY + 12, { width: cardWidth, align: 'center' });

            // Auto-scale font size for amount?
            let amountFontSize = 15;
            if (amount.length > 12) amountFontSize = 13;
            doc.fontSize(amountFontSize).font('Helvetica-Bold').text(amount, x, cardY + 32, { width: cardWidth, align: 'center' });

            doc.fontSize(9).font('Helvetica').text("so'm", x, cardY + 52, { width: cardWidth, align: 'center' });
        }

        drawCard(card1X, '#10b981', 'JAMI KIRIM', `+${totalInc.toLocaleString()}`);
        drawCard(card2X, '#ef4444', 'JAMI CHIQIM', `-${totalExp.toLocaleString()}`);
        drawCard(card3X, '#3b82f6', 'BALANS', `${balance >= 0 ? '+' : ''}${balance.toLocaleString()}`);

        doc.y = cardY + cardHeight + 25;

        // 5. Table Header & Columns (Full Width 515pt)
        const tableTop = doc.y;
        const colWidths = {
            date: 60,
            description: 190,
            type: 55,
            amount: 105,
            balance: 105
        };
        // Total: 60+190+55+105+105 = 515pt

        // 4. Opening Balance - "Ostatka" (Boxed Layout)
        const openingBalanceY = doc.y;
        const balansColumnX = 40 + colWidths.date + colWidths.description + colWidths.type + colWidths.amount;
        const balansColumnWidth = colWidths.balance;

        // Draw light background for Ostatka
        doc.roundedRect(balansColumnX, openingBalanceY, balansColumnWidth, 32, 4).fillAndStroke('#f8fafc', '#e2e8f0');

        doc.fillColor('#64748b')
            .fontSize(8)
            .font('Helvetica-Bold')
            .text("Ostatka", balansColumnX + 5, openingBalanceY + 6, {
                width: balansColumnWidth - 10,
                align: 'right'
            });

        doc.fillColor(startingBalance >= 0 ? '#059669' : '#dc2626')
            .fontSize(10)
            .font('Helvetica-Bold')
            .text(`${startingBalance >= 0 ? '+' : ''}${startingBalance.toLocaleString()}`, balansColumnX + 5, openingBalanceY + 18, {
                width: balansColumnWidth - 10,
                align: 'right'
            });

        doc.moveDown(3.5); // More space
        const adjustedTableTop = doc.y;

        doc.rect(40, adjustedTableTop, 515, 30).fillAndStroke('#334155', '#334155');

        doc.fillColor('#ffffff')
            .fontSize(9.5)
            .font('Helvetica-Bold')
            .text('SANA', 40 + 2, adjustedTableTop + 11, { width: colWidths.date, align: 'center' })
            .text('TAVSIF', 40 + colWidths.date + 10, adjustedTableTop + 11, { width: colWidths.description })
            .text('TUR', 40 + colWidths.date + colWidths.description, adjustedTableTop + 11, { width: colWidths.type, align: 'center' });

        const summaX = 40 + colWidths.date + colWidths.description + colWidths.type;
        doc.text('SUMMA', summaX, adjustedTableTop + 7, { width: colWidths.amount, align: 'right' })
            .fontSize(8)
            .text('(so\'m)', summaX, adjustedTableTop + 17, { width: colWidths.amount, align: 'right' });

        const balColX = 40 + colWidths.date + colWidths.description + colWidths.type + colWidths.amount;
        doc.fontSize(9.5)
            .text('BALANS', balColX, adjustedTableTop + 7, { width: colWidths.balance, align: 'right' })
            .fontSize(8)
            .text('(so\'m)', balColX, adjustedTableTop + 17, { width: colWidths.balance, align: 'right' });

        let currentY = adjustedTableTop + 30;

        // 6. Table Rows
        const sortedRows = [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        let runningBalance = startingBalance; // START FROM OPENING BALANCE

        sortedRows.forEach((row, index) => {
            if (currentY > 750) {
                doc.addPage();
                currentY = 50;
            }

            // SAFETY: Ensure row values are valid
            const amount = Number(row.amount) || 0;
            const description = row.description || '';

            if (row.type === 'income') runningBalance += amount;
            else runningBalance -= amount;

            const rowColor = index % 2 === 0 ? '#ffffff' : '#f8fafc';
            doc.rect(40, currentY, 515, 32).fillAndStroke(rowColor, '#e2e8f0');

            // Date Handling
            let shortDate = '-/-';
            try {
                const date = new Date(row.created_at);
                if (!isNaN(date.getTime())) {
                    shortDate = `${date.getDate()}/${date.getMonth() + 1}`;
                }
            } catch (err) { }

            const isIncome = row.type === 'income';

            // Date
            doc.fillColor('#475569').fontSize(9).font('Helvetica').text(shortDate, 40 + 2, currentY + 10, { width: colWidths.date, align: 'center' });

            // Description
            doc.fillColor('#0f172a').fontSize(8.5).text(description.substring(0, 30), 40 + colWidths.date + 10, currentY + 10, { width: colWidths.description, ellipsis: true });

            // Type Badge
            const badgeColor = isIncome ? '#10b981' : '#ef4444';
            doc.roundedRect(40 + colWidths.date + colWidths.description + 5, currentY + 8, 45, 16, 3).fillAndStroke(badgeColor, badgeColor);
            doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold').text(isIncome ? 'Kirim' : 'Chiqim', 40 + colWidths.date + colWidths.description + 5, currentY + 11, { width: 45, align: 'center' });

            // Amount
            const amountColor = isIncome ? '#059669' : '#dc2626';
            doc.fillColor(amountColor).fontSize(9).font('Helvetica-Bold').text(`${isIncome ? '+' : '-'}${amount.toLocaleString()}`, summaX, currentY + 10, { width: colWidths.amount, align: 'right' });

            // Running Balance - Aligned with BAL. column
            const balanceColor = runningBalance >= 0 ? '#0f172a' : '#dc2626';
            doc.fillColor(balanceColor).fontSize(9).font('Helvetica-Bold').text(runningBalance.toLocaleString(), balColX, currentY + 10, { width: colWidths.balance, align: 'right' });

            currentY += 32;
        });

        // 7. Footer Summary
        doc.moveDown(1.5);
        if (currentY > 700) { doc.addPage(); currentY = 50; }

        const summaryY = currentY + 20;
        doc.roundedRect(40, summaryY, 515, 90, 8).fillAndStroke('#f1f5f9', '#cbd5e1');

        const footerValueWidth = 200;
        const footerValueX = 345;

        doc.fillColor('#0f172a').fontSize(10).font('Helvetica').text('Jami Kirim:', 50, summaryY + 12);
        doc.fillColor('#059669').font('Helvetica-Bold').text(`+${totalInc.toLocaleString()} so'm`, footerValueX, summaryY + 12, { width: footerValueWidth, align: 'right' });

        doc.fillColor('#0f172a').font('Helvetica').text('Jami Chiqim:', 50, summaryY + 30);
        doc.fillColor('#dc2626').font('Helvetica-Bold').text(`-${totalExp.toLocaleString()} so'm`, footerValueX, summaryY + 30, { width: footerValueWidth, align: 'right' });

        doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(50, summaryY + 50).lineTo(545, summaryY + 50).stroke();

        doc.fillColor('#0f172a').fontSize(12).font('Helvetica-Bold').text('YAKUNIY BALANS:', 50, summaryY + 62);
        // Recalculate final balance safely
        const finalBalance = totalInc - totalExp;
        doc.fillColor(finalBalance >= 0 ? '#059669' : '#dc2626').text(`${finalBalance >= 0 ? '+' : ''}${finalBalance.toLocaleString()} so'm`, footerValueX, summaryY + 62, { width: footerValueWidth, align: 'right' });

        doc.fillColor('#94a3b8').fontSize(7).font('Helvetica-Oblique').text(`Yaratilgan: ${new Date().toLocaleString('uz-UZ')}`, 350, 780, { align: 'right' });

        doc.end();
        console.log("✅ Final V2 PDF generated: test_final_polished_v2.pdf");

    } catch (e) {
        console.error("PDF Error:", e);
    }
}

testPDF();
