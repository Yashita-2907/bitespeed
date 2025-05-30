"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
app.use(express_1.default.json());
app.get('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const allUsers = yield prisma.user.findMany();
    res.json(allUsers);
}));
app.post('/users', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, email } = req.body;
        if (!name || !email) {
            return res.status(400).json({ error: "Name and email are required" });
        }
        const user = yield prisma.user.create({
            data: { name, email }
        });
        res.status(201).json(user);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}));
// ... your existing imports and code ...

app.post('/identify', async (req, res) => {
  const { email, phoneNumber } = req.body;

  if (!email && !phoneNumber) {
    return res.status(400).json({ error: "Email or phoneNumber is required" });
  }

  // Find all matching contacts
  const contacts = await prisma.contact.findMany({
    where: {
      OR: [
        email ? { email } : undefined,
        phoneNumber ? { phoneNumber } : undefined,
      ].filter(Boolean),
    },
    orderBy: { createdAt: 'asc' },
  });

  if (contacts.length === 0) {
    // Create new PRIMARY contact if none exist
    const newContact = await prisma.contact.create({
      data: {
        email,
        phoneNumber,
        linkPrecedence: 'PRIMARY',
      },
    });

    return res.json({
      contact: {
        primaryContactId: newContact.id,
        emails: [newContact.email].filter(Boolean),
        phoneNumbers: [newContact.phoneNumber].filter(Boolean),
        secondaryContactIds: [],
      },
    });
  }

  // Get the oldest PRIMARY contact as the source of truth
  const primaryContact = contacts.find(c => c.linkPrecedence === 'PRIMARY') || contacts[0];

  // Check if incoming info already exists in contacts
  const alreadyExists = contacts.some(c =>
    (email && c.email === email) || (phoneNumber && c.phoneNumber === phoneNumber)
  );

  let newContact = null;
  if (!alreadyExists) {
    newContact = await prisma.contact.create({
      data: {
        email,
        phoneNumber,
        linkPrecedence: 'SECONDARY',
        linkedId: primaryContact.id,
      },
    });
  }

  // Combine all contacts (including new one if created)
  const allContacts = [...contacts, ...(newContact ? [newContact] : [])];

  const emails = Array.from(new Set(allContacts.map(c => c.email).filter(Boolean)));
  const phoneNumbers = Array.from(new Set(allContacts.map(c => c.phoneNumber).filter(Boolean)));
  const secondaryContactIds = allContacts.filter(c => c.linkPrecedence === 'SECONDARY').map(c => c.id);

  res.json({
    contact: {
      primaryContactId: primaryContact.id,
      emails,
      phoneNumbers,
      secondaryContactIds,
    },
  });
});

// your existing server listen code

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
console.log(Object.keys(prisma));

