import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
app.use(express.json());

app.post('/identify', async (req: Request, res: Response) => {
  const { email, phoneNumber } = req.body;

  if (!email && !phoneNumber) {
    return res.status(400).json({ error: "email or phoneNumber required" });
  }

  // Step 1: Find all matching contacts by email or phoneNumber
  const matchingContacts = await prisma.contact.findMany({
    where: {
      OR: [
        ...(email ? [{ email }] : []),
        ...(phoneNumber ? [{ phoneNumber }] : []),
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  if (matchingContacts.length === 0) {
    // No matching contacts — create a new primary contact
    const newPrimary = await prisma.contact.create({
      data: {
        email,
        phoneNumber,
        linkPrecedence: "PRIMARY",
      },
    });

    return res.json({
      contact: {
        primaryContactId: newPrimary.id,
        emails: [newPrimary.email].filter(Boolean),
        phoneNumbers: [newPrimary.phoneNumber].filter(Boolean),
        secondaryContactIds: [],
      },
    });
  }

  // Step 2: Determine the primary contact (the one with linkPrecedence PRIMARY)
  let primaryContact = matchingContacts.find(c => c.linkPrecedence === "PRIMARY") || matchingContacts[0];
  const primaryId = primaryContact.linkPrecedence === "PRIMARY" ? primaryContact.id : primaryContact.linkedId;

  // Step 3: Fetch all contacts linked to the primary contact
  const linkedContacts = await prisma.contact.findMany({
    where: {
      OR: [{ id: primaryId }, { linkedId: primaryId }],
    },
    orderBy: { createdAt: "asc" },
  });

  // Gather existing emails and phone numbers across linked contacts
  const emails = new Set(linkedContacts.map(c => c.email).filter(Boolean));
  const phones = new Set(linkedContacts.map(c => c.phoneNumber).filter(Boolean));

  const isNewEmail = email && !emails.has(email);
  const isNewPhone = phoneNumber && !phones.has(phoneNumber);

  // Step 4: Update primary contact if it’s missing the new email or phone
  const updateData: any = {};
  if (email && !primaryContact.email) {
    updateData.email = email;
  }
  if (phoneNumber && !primaryContact.phoneNumber) {
    updateData.phoneNumber = phoneNumber;
  }
  if (Object.keys(updateData).length > 0) {
    primaryContact = await prisma.contact.update({
      where: { id: primaryContact.id },
      data: updateData,
    });
  } else if (isNewEmail || isNewPhone) {
    // Step 5: If primary already has email and phone, create a new secondary contact for new info
    await prisma.contact.create({
      data: {
        email: isNewEmail ? email : null,
        phoneNumber: isNewPhone ? phoneNumber : null,
        linkedId: primaryId,
        linkPrecedence: "SECONDARY",
      },
    });
  }

  // Step 6: Fetch updated linked contacts after changes
  const updatedContacts = await prisma.contact.findMany({
    where: {
      OR: [{ id: primaryId }, { linkedId: primaryId }],
    },
    orderBy: { createdAt: "asc" },
  });

  return res.json({
    contact: {
      primaryContactId: primaryId,
      emails: [...new Set(updatedContacts.map(c => c.email).filter(Boolean))],
      phoneNumbers: [...new Set(updatedContacts.map(c => c.phoneNumber).filter(Boolean))],
      secondaryContactIds: updatedContacts
        .filter(c => c.linkPrecedence === "SECONDARY")
        .map(c => c.id),
    },
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
