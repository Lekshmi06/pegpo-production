import { Request, Response } from "express";
import Party from "../models/Party";
import SalesQuote from "../models/SalesQuote";
import Account from "../models/Account";

export const adminCrmController = {
  // -------------------------------------------------------------------------
  // PARTIES (Customers, Suppliers, Leads)
  // -------------------------------------------------------------------------
  async getParties(req: Request, res: Response): Promise<void> {
    try {
      const { role } = req.query;
      const filter: any = {};
      if (role && role !== "All") {
        filter.$or = [{ role }, { role: "Both" }];
      }
      const parties = await Party.find(filter).sort({ createdAt: 1 }).lean();
      res.json({ success: true, data: parties });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async createParty(req: Request, res: Response): Promise<void> {
    try {
      const {
        name,
        role,
        gstin,
        pan,
        email,
        phone,
        address,
        placeOfSupply,
        defaultAccount,
        openingBalance,
        outstandingAmount,
        status,
      } = req.body;

      if (!name) {
        res.status(400).json({ success: false, message: "Party name is required." });
        return;
      }

      const newParty = await Party.create({
        id: `party-${Date.now()}`,
        name,
        role: role || "Customer",
        gstin: gstin || "",
        pan: pan || "",
        email: email || "",
        phone: phone || "",
        address: address || "",
        placeOfSupply: placeOfSupply || "Maharashtra",
        defaultAccount: defaultAccount || (role === "Supplier" ? "Creditors" : "Debtors"),
        openingBalance: Number(openingBalance) || 0,
        outstandingAmount: Number(outstandingAmount) || Number(openingBalance) || 0,
        status: status || "Active",
      });

      res.status(201).json({ success: true, data: newParty.toObject() });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async updateParty(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const party = await Party.findOne({ $or: [{ id }, { name: id }] });
      if (!party) {
        res.status(404).json({ success: false, message: "Party not found." });
        return;
      }

      Object.assign(party, req.body);
      await party.save();

      res.json({ success: true, data: party.toObject() });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async deleteParty(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const result = await Party.deleteOne({ $or: [{ id }, { name: id }] });
      if (result.deletedCount === 0) {
        res.status(404).json({ success: false, message: "Party not found." });
        return;
      }
      res.json({ success: true, message: "Party deleted successfully." });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // -------------------------------------------------------------------------
  // SALES QUOTES
  // -------------------------------------------------------------------------
  async getSalesQuotes(_req: Request, res: Response): Promise<void> {
    try {
      const quotes = await SalesQuote.find().sort({ createdAt: -1 }).lean();
      res.json({ success: true, data: quotes });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async createSalesQuote(req: Request, res: Response): Promise<void> {
    try {
      const { party, date, validUntil, items, currency, notes, status } = req.body;
      if (!party) {
        res.status(400).json({ success: false, message: "Party / Customer is required." });
        return;
      }
      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ success: false, message: "At least one item is required." });
        return;
      }

      let netTotal = 0;
      let taxTotal = 0;
      const processedItems = items.map((it: any) => {
        const qty = Number(it.quantity) || 1;
        const rate = Number(it.rate) || 0;
        const amount = qty * rate;
        const taxRate = Number(it.taxRate) || 18;
        const taxAmount = (amount * taxRate) / 100;
        const total = amount + taxAmount;
        netTotal += amount;
        taxTotal += taxAmount;

        return {
          ...it,
          quantity: qty,
          rate,
          amount,
          taxRate,
          taxAmount,
          total,
          account: it.account || "Sales",
        };
      });

      const grandTotal = netTotal + taxTotal;
      const quoteCount = await SalesQuote.countDocuments();
      const quoteNumber = `SQ-2026-${String(quoteCount + 1).padStart(3, "0")}`;

      const newQuote = await SalesQuote.create({
        id: `quote-${Date.now()}`,
        quoteNumber,
        party,
        date: date || new Date().toISOString().split("T")[0],
        validUntil: validUntil || "",
        status: status || "Draft",
        currency: currency || "INR",
        items: processedItems,
        netTotal,
        taxTotal,
        grandTotal,
        notes: notes || "",
      });

      res.status(201).json({ success: true, data: newQuote.toObject() });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async updateSalesQuote(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const quote = await SalesQuote.findOne({ $or: [{ id }, { quoteNumber: id }] });
      if (!quote) {
        res.status(404).json({ success: false, message: "Sales Quote not found." });
        return;
      }

      const { party, date, validUntil, items, currency, notes, status } = req.body;
      if (party) quote.party = party;
      if (date) quote.date = date;
      if (validUntil !== undefined) quote.validUntil = validUntil;
      if (currency) quote.currency = currency;
      if (notes !== undefined) quote.notes = notes;
      if (status) quote.status = status;

      if (Array.isArray(items)) {
        let netTotal = 0;
        let taxTotal = 0;
        quote.items = items.map((it: any) => {
          const qty = Number(it.quantity) || 1;
          const rate = Number(it.rate) || 0;
          const amount = qty * rate;
          const taxRate = Number(it.taxRate) || 18;
          const taxAmount = (amount * taxRate) / 100;
          const total = amount + taxAmount;
          netTotal += amount;
          taxTotal += taxAmount;

          return {
            ...it,
            quantity: qty,
            rate,
            amount,
            taxRate,
            taxAmount,
            total,
            account: it.account || "Sales",
          };
        });
        quote.netTotal = netTotal;
        quote.taxTotal = taxTotal;
        quote.grandTotal = netTotal + taxTotal;
      }

      await quote.save();
      res.json({ success: true, data: quote.toObject() });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async convertQuoteToInvoice(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const quote = await SalesQuote.findOne({ $or: [{ id }, { quoteNumber: id }] });
      if (!quote) {
        res.status(404).json({ success: false, message: "Sales Quote not found." });
        return;
      }

      const invoiceNumber = `INV-2026-${Date.now().toString().slice(-4)}`;
      quote.status = "Accepted";
      quote.convertedToInvoice = invoiceNumber;
      await quote.save();

      res.json({
        success: true,
        message: "Sales Quote converted to invoice reference successfully.",
        invoiceNumber,
        data: quote.toObject(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async deleteSalesQuote(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const result = await SalesQuote.deleteOne({ $or: [{ id }, { quoteNumber: id }] });
      if (result.deletedCount === 0) {
        res.status(404).json({ success: false, message: "Sales Quote not found." });
        return;
      }
      res.json({ success: true, message: "Sales Quote deleted successfully." });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // -------------------------------------------------------------------------
  // CHART OF ACCOUNTS
  // -------------------------------------------------------------------------
  async getAccounts(_req: Request, res: Response): Promise<void> {
    try {
      const accounts = await Account.find().sort({ id: 1 }).lean();
      res.json({ success: true, data: accounts });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async createAccount(req: Request, res: Response): Promise<void> {
    try {
      const { name, accountType, rootType, parent, isGroup, balance, currency } = req.body;
      if (!name) {
        res.status(400).json({ success: false, message: "Account name is required." });
        return;
      }

      const newAccount = await Account.create({
        id: `acc-${Date.now()}`,
        name,
        accountType: accountType || "General",
        rootType: rootType || "Asset",
        parent: parent || null,
        isGroup: Boolean(isGroup),
        balance: Number(balance) || 0,
        currency: currency || "INR",
      });

      res.status(201).json({ success: true, data: newAccount.toObject() });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async updateAccount(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const account = await Account.findOne({ $or: [{ id }, { name: id }] });
      if (!account) {
        res.status(404).json({ success: false, message: "Account not found." });
        return;
      }

      Object.assign(account, req.body);
      await account.save();

      res.json({ success: true, data: account.toObject() });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async deleteAccount(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const result = await Account.deleteOne({ $or: [{ id }, { name: id }] });
      if (result.deletedCount === 0) {
        res.status(404).json({ success: false, message: "Account not found." });
        return;
      }
      res.json({ success: true, message: "Account deleted successfully." });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

export default adminCrmController;

