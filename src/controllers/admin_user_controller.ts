import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User, { IUser } from "../models/User";
import { isSuperAdmin, isAdmin } from "../middlewares/admin_module_middleware";

/**
 * Check if the current user is the owner/manager of the target user
 */
function isStaffOwner(currentUser: any, targetUser: any): boolean {
  if (isSuperAdmin(currentUser.adminRole || currentUser.role)) return true;

  const isCreatedBy =
    (targetUser.createdBy && targetUser.createdBy.toString() === currentUser._id.toString()) ||
    (targetUser.createdById && targetUser.createdById === currentUser.id);

  const isAssigned =
    targetUser.assignedAdminId &&
    (targetUser.assignedAdminId === currentUser.userId ||
      targetUser.assignedAdminId === currentUser.username);

  return Boolean(isCreatedBy || isAssigned);
}

export const adminUserController = {
  /**
   * List Users with Role-Based Scoping & Search Filters
   * Route: GET /api/users
   */
  async getUsers(req: Request, res: Response): Promise<void> {
    try {
      const { search, role, status } = req.query;
      const currentUser = req.user as any;

      if (!currentUser) {
        res.status(401).json({ success: false, message: "Authentication required." });
        return;
      }

      const userRole = currentUser.adminRole || currentUser.role;
      let filter: any = {};

      if (isSuperAdmin(userRole)) {
        if (role && role !== "All") {
          filter.role = role;
        }
      } else if (isAdmin(userRole)) {
        const adminScope: any[] = [
          { createdBy: currentUser._id },
          { createdById: currentUser.id },
        ];
        if (currentUser.userId) {
          adminScope.push({ assignedAdminId: currentUser.userId });
        }
        if (currentUser.username) {
          adminScope.push({ assignedAdminId: currentUser.username });
        }

        filter = {
          $or: adminScope,
          role: {
            $in: [
              "Staff",
              "STAFF",
              "USER",
              "Manager",
              "HR",
              "Finance",
              "Marketing",
              "Support",
            ],
          },
        };

        if (role && role !== "All") {
          filter.role = role;
        }
      } else {
        res.status(403).json({
          success: false,
          message: "Access denied: Staff accounts cannot access user administration.",
        });
        return;
      }

      if (status && status !== "All") {
        if (status === "Active") {
          filter.status = { $in: ["Active", null] };
        } else {
          filter.status = status;
        }
      }

      if (search && typeof search === "string" && search.trim()) {
        const q = search.trim();
        const searchRegex = new RegExp(q, "i");
        const searchFilter = {
          $or: [
            { username: searchRegex },
            { displayName: searchRegex },
            { fullName: searchRegex },
            { email: searchRegex },
            { userId: searchRegex },
            { department: searchRegex },
          ],
        };

        if (filter.$or) {
          filter = {
            $and: [{ $or: filter.$or }, searchFilter],
          };
          if (filter.role) filter.role = filter.role;
          if (filter.status) filter.status = filter.status;
        } else {
          filter = { ...filter, ...searchFilter };
        }
      }

      const users = await User.find(filter)
        .select("-passwordHash -password")
        .sort({ createdAt: -1 })
        .lean();

      const formattedUsers = users.map((u: any) => {
        const username =
          u.username ||
          (u.email ? u.email.split("@")[0] : "") ||
          (u.userId ? u.userId.toLowerCase() : "") ||
          `user_${(u._id || "").toString().slice(-6)}`;
        const displayName =
          u.displayName ||
          u.fullName ||
          u.name ||
          username ||
          (u.email ? u.email.split("@")[0] : "User");
        const id = u.id || u._id;
        const userId =
          u.userId ||
          (u.id
            ? `USR-${u.id}`
            : u._id
              ? `USR-${u._id.toString().slice(-6).toUpperCase()}`
              : "USR-0");

        return {
          ...u,
          id,
          userId,
          username,
          displayName,
          status: u.status || "Active",
          department: u.department || "General",
          createdByName: u.createdByName || "System",
          allowedModules: u.allowedModules || undefined,
        };
      });

      res.json({
        success: true,
        count: formattedUsers.length,
        users: formattedUsers,
      });
    } catch (err: any) {
      console.error("Error in getUsers:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * Get User Management Stats (Role-Scoped)
   * Route: GET /api/users/stats
   */
  async getUserStats(req: Request, res: Response): Promise<void> {
    try {
      const currentUser = req.user as any;
      if (!currentUser) {
        res.status(401).json({ success: false, message: "Authentication required." });
        return;
      }
      const userRole = currentUser.adminRole || currentUser.role;

      if (isSuperAdmin(userRole)) {
        const [totalUsers, totalAdmins, totalStaff, activeUsers, lockedUsers] =
          await Promise.all([
            User.countDocuments(),
            User.countDocuments({
              $or: [{ role: { $in: ["Admin", "ADMIN"] } }, { adminRole: "Admin" }],
            }),
            User.countDocuments({
              role: {
                $nin: ["Admin", "ADMIN", "Super Admin", "SUPER_ADMIN"],
              },
            }),
            User.countDocuments({ status: { $in: ["Active", "active", null] } }),
            User.countDocuments({ status: { $in: ["Locked", "Inactive", "suspended"] } }),
          ]);

        res.json({
          success: true,
          isSuperAdmin: true,
          stats: {
            totalUsers,
            totalAdmins,
            totalStaff,
            activeUsers,
            lockedUsers,
          },
        });
        return;
      }

      if (isAdmin(userRole)) {
        const adminScope = {
          $or: [
            { createdBy: currentUser._id },
            { createdById: currentUser.id },
            { assignedAdminId: currentUser.userId || currentUser.username },
          ],
          role: {
            $in: [
              "Staff",
              "STAFF",
              "USER",
              "Manager",
              "HR",
              "Finance",
              "Marketing",
              "Support",
            ],
          },
        };

        const [myStaffCount, myActiveStaff, myLockedStaff] = await Promise.all([
          User.countDocuments(adminScope),
          User.countDocuments({ ...adminScope, status: { $in: ["Active", "active", null] } }),
          User.countDocuments({ ...adminScope, status: { $in: ["Locked", "Inactive"] } }),
        ]);

        res.json({
          success: true,
          isSuperAdmin: false,
          stats: {
            totalUsers: myStaffCount,
            totalAdmins: 0,
            totalStaff: myStaffCount,
            activeUsers: myActiveStaff,
            lockedUsers: myLockedStaff,
          },
        });
        return;
      }

      res.status(403).json({ success: false, message: "Access denied." });
    } catch (err: any) {
      console.error("Error in getUserStats:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * Create User (Admin or Staff)
   * Route: POST /api/users
   */
  async createUser(req: Request, res: Response): Promise<void> {
    try {
      const currentUser = req.user as any;
      const {
        userId,
        username,
        email,
        displayName,
        role = "Staff",
        department = "General",
        password,
        allowedModules,
      } = req.body;

      if (!username || !email || !displayName || !password) {
        res.status(400).json({
          success: false,
          message: "Username, email, display name, and initial password are required.",
        });
        return;
      }

      if (password.length < 6) {
        res.status(400).json({
          success: false,
          message: "Initial password must be at least 6 characters long.",
        });
        return;
      }

      const cleanUsername = username.trim().toLowerCase();
      const cleanEmail = email.trim().toLowerCase();

      // Check for duplicate username or email
      const existingUser = await User.findOne({
        $or: [{ username: cleanUsername }, { email: cleanEmail }],
      });

      if (existingUser) {
        if (existingUser.username === cleanUsername) {
          res.status(409).json({
            success: false,
            message: `Username '${cleanUsername}' is already taken.`,
          });
          return;
        }
        res.status(409).json({
          success: false,
          message: `Email '${cleanEmail}' is already registered.`,
        });
        return;
      }

      const currentUserRole = currentUser.adminRole || currentUser.role;

      // Role permission check
      if (isAdmin(currentUserRole)) {
        if (isSuperAdmin(role) || isAdmin(role)) {
          res.status(403).json({
            success: false,
            message:
              "Privilege escalation prevented: Administrators are only permitted to create Staff accounts.",
          });
          return;
        }
      }

      const finalRole = isSuperAdmin(currentUserRole)
        ? (role === "Super Admin" ? "Super Admin" : (role.includes("Tuition") ? "Tuition Operations Admin" : (role === "Admin" ? "Admin" : "Staff")))
        : (role === "Admin" ? "Admin" : "Staff");

      // Generate or validate unique User ID
      let finalUserId = userId ? userId.trim().toUpperCase() : null;
      if (finalUserId) {
        const idExists = await User.findOne({ userId: finalUserId });
        if (idExists) {
          res.status(409).json({
            success: false,
            message: `User ID '${finalUserId}' already exists.`,
          });
          return;
        }
      } else {
        const prefix = finalRole === "Super Admin" ? "SA" : (finalRole.includes("Tuition") ? "TAD" : (finalRole === "Admin" ? "ADM" : "STF"));
        let isUnique = false;
        while (!isUnique) {
          const randNum = Math.floor(100 + Math.random() * 900);
          finalUserId = `${prefix}-${randNum}`;
          const existing = await User.findOne({ userId: finalUserId });
          if (!existing) isUnique = true;
        }
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const maxIdDoc: any = await User.findOne({}).sort({ id: -1 }).select("id").lean();
      const nextNumericId = maxIdDoc && maxIdDoc.id ? maxIdDoc.id + 1 : Date.now() % 100000;

      let cleanAllowedModules = undefined;
      if (Array.isArray(allowedModules)) {
        cleanAllowedModules = allowedModules
          .map(Number)
          .filter((n) => !isNaN(n) && n > 0);

        if (isAdmin(currentUserRole)) {
          cleanAllowedModules = cleanAllowedModules.filter((id) => id !== 53 && id !== 9);
        }
      } else if (finalRole === "Tuition Operations Admin") {
        cleanAllowedModules = [1, 2, 3, 4, 5, 33];
      }

      const newUser = await User.create({
        id: nextNumericId,
        userId: finalUserId,
        username: cleanUsername,
        email: cleanEmail,
        displayName: displayName.trim(),
        fullName: displayName.trim(),
        name: displayName.trim(),
        role: finalRole,
        adminRole: finalRole as any,
        department: department.trim(),
        allowedModules: cleanAllowedModules,
        passwordHash,
        password: passwordHash,
        status: "Active",
        createdBy: currentUser._id,
        createdById: currentUser.id,
        createdByName: currentUser.displayName || currentUser.name,
        createdByRole: currentUserRole,
        assignedAdminId: currentUser.userId || currentUser.username,
        tokenVersion: 0,
      });

      const userObject: any = newUser.toObject();
      delete userObject.passwordHash;
      delete userObject.password;
      delete userObject.__v;

      res.status(201).json({
        success: true,
        message: `${role} account '${cleanUsername}' created successfully.`,
        user: userObject,
      });
    } catch (err: any) {
      console.error("Error in createUser:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * Update User Account
   * Route: PUT /api/users/:id
   */
  async updateUser(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const currentUser = req.user as any;
      const { displayName, email, department, role, status, allowedModules } = req.body;

      const userQuery = mongoose.Types.ObjectId.isValid(id)
        ? { _id: id }
        : isNaN(Number(id))
          ? { userId: id }
          : { id: Number(id) };

      const targetUser = await User.findOne(userQuery);
      if (!targetUser) {
        res.status(404).json({ success: false, message: "User not found." });
        return;
      }

      const currentUserRole = currentUser.adminRole || currentUser.role;

      if (isAdmin(currentUserRole)) {
        if (isAdmin(targetUser.adminRole || targetUser.role) || isSuperAdmin(targetUser.adminRole || targetUser.role)) {
          res.status(403).json({
            success: false,
            message:
              "Access denied: Administrators cannot modify Administrator or Super Administrator accounts.",
          });
          return;
        }

        if (!isStaffOwner(currentUser, targetUser)) {
          res.status(403).json({
            success: false,
            message: "Access denied: You can only modify your own assigned staff accounts.",
          });
          return;
        }

        if (role && (isAdmin(role) || isSuperAdmin(role))) {
          res.status(403).json({
            success: false,
            message: "Privilege escalation denied: Cannot assign Administrator role.",
          });
          return;
        }
      }

      if (email && email.toLowerCase().trim() !== targetUser.email) {
        const cleanEmail = email.toLowerCase().trim();
        const emailExists = await User.findOne({
          email: cleanEmail,
          _id: { $ne: targetUser._id },
        });
        if (emailExists) {
          res.status(409).json({
            success: false,
            message: `Email '${cleanEmail}' is already in use by another account.`,
          });
          return;
        }
        targetUser.email = cleanEmail;
      }

      if (displayName) {
        targetUser.displayName = displayName.trim();
        targetUser.fullName = displayName.trim();
        targetUser.name = displayName.trim();
      }
      if (department) targetUser.department = department.trim();

      if (isSuperAdmin(currentUserRole) && role) {
        targetUser.role = role;
        targetUser.adminRole = role;
      }

      if (allowedModules !== undefined) {
        if (Array.isArray(allowedModules)) {
          let cleanModules = allowedModules
            .map(Number)
            .filter((n) => !isNaN(n) && n > 0);

          if (isAdmin(currentUserRole)) {
            cleanModules = cleanModules.filter((id) => id !== 53 && id !== 9);
          }
          targetUser.allowedModules = cleanModules;
        } else if (allowedModules === null) {
          targetUser.allowedModules = undefined;
        }
      }

      if (status && ["Active", "Inactive", "Locked"].includes(status)) {
        if (status !== targetUser.status && status === "Locked") {
          targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
        }
        targetUser.status = status;
      }

      await targetUser.save();

      const userObject: any = targetUser.toObject();
      delete userObject.passwordHash;
      delete userObject.password;
      delete userObject.__v;

      res.json({
        success: true,
        message: `Account '${targetUser.username}' updated successfully.`,
        user: userObject,
      });
    } catch (err: any) {
      console.error("Error in updateUser:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * Reset User Password
   * Route: POST /api/users/:id/reset-password
   */
  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const currentUser = req.user as any;
      const { newPassword } = req.body;

      const userQuery = mongoose.Types.ObjectId.isValid(id)
        ? { _id: id }
        : isNaN(Number(id))
          ? { userId: id }
          : { id: Number(id) };

      const targetUser = await User.findOne(userQuery);
      if (!targetUser) {
        res.status(404).json({ success: false, message: "User not found." });
        return;
      }

      const currentUserRole = currentUser.adminRole || currentUser.role;

      if (isAdmin(currentUserRole)) {
        if (isAdmin(targetUser.adminRole || targetUser.role) || isSuperAdmin(targetUser.adminRole || targetUser.role)) {
          res.status(403).json({
            success: false,
            message: "Access denied: Administrators cannot reset passwords for other Administrators.",
          });
          return;
        }
        if (!isStaffOwner(currentUser, targetUser)) {
          res.status(403).json({
            success: false,
            message: "Access denied: You can only reset passwords for your assigned staff accounts.",
          });
          return;
        }
      }

      let passwordToSet = newPassword;
      let isGenerated = false;

      if (!passwordToSet || !passwordToSet.trim()) {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
        passwordToSet = Array.from(
          { length: 12 },
          () => chars[Math.floor(Math.random() * chars.length)]
        ).join("");
        isGenerated = true;
      }

      if (passwordToSet.length < 6) {
        res.status(400).json({
          success: false,
          message: "Password must be at least 6 characters long.",
        });
        return;
      }

      const hash = await bcrypt.hash(passwordToSet, 10);
      targetUser.passwordHash = hash;
      targetUser.password = hash;
      targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
      targetUser.failedLoginAttempts = 0;
      targetUser.lockoutUntil = null;
      if (targetUser.status === "Locked") {
        targetUser.status = "Active";
        targetUser.lockoutReason = undefined;
      }

      await targetUser.save();

      res.json({
        success: true,
        message: `Password reset successfully for @${targetUser.username}. All previous sessions have been invalidated.`,
        generatedPassword: isGenerated ? passwordToSet : undefined,
      });
    } catch (err: any) {
      console.error("Error in resetPassword:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * Toggle Account Status (Activate / Deactivate / Lock)
   * Route: PATCH /api/users/:id/status
   */
  async toggleStatus(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const currentUser = req.user as any;
      const { status, reason } = req.body;

      if (!["Active", "Inactive", "Locked"].includes(status)) {
        res.status(400).json({
          success: false,
          message: "Status must be 'Active', 'Inactive', or 'Locked'.",
        });
        return;
      }

      const userQuery = mongoose.Types.ObjectId.isValid(id)
        ? { _id: id }
        : isNaN(Number(id))
          ? { userId: id }
          : { id: Number(id) };

      const targetUser = await User.findOne(userQuery);
      if (!targetUser) {
        res.status(404).json({ success: false, message: "User not found." });
        return;
      }

      if (
        targetUser._id.toString() === currentUser._id.toString() ||
        targetUser.username === currentUser.username
      ) {
        res.status(400).json({
          success: false,
          message: "Security policy: You cannot deactivate or lock your own account.",
        });
        return;
      }

      const currentUserRole = currentUser.adminRole || currentUser.role;

      if (isAdmin(currentUserRole)) {
        if (isAdmin(targetUser.adminRole || targetUser.role) || isSuperAdmin(targetUser.adminRole || targetUser.role)) {
          res.status(403).json({
            success: false,
            message: "Access denied: Administrators cannot change status of other Administrators.",
          });
          return;
        }
        if (!isStaffOwner(currentUser, targetUser)) {
          res.status(403).json({
            success: false,
            message: "Access denied: You can only manage status of your assigned staff accounts.",
          });
          return;
        }
      }

      targetUser.status = status;
      if (status === "Locked") {
        targetUser.lockoutReason = reason || "Account locked by administrator.";
        targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
      } else if (status === "Inactive") {
        targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
      } else if (status === "Active") {
        targetUser.lockoutReason = undefined;
        targetUser.failedLoginAttempts = 0;
      }

      await targetUser.save();

      const userObject: any = targetUser.toObject();
      delete userObject.passwordHash;
      delete userObject.password;

      res.json({
        success: true,
        message: `Status for @${targetUser.username} set to '${status}'.`,
        user: userObject,
      });
    } catch (err: any) {
      console.error("Error in toggleStatus:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * Delete User Account
   * Route: DELETE /api/users/:id
   */
  async deleteUser(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const currentUser = req.user as any;

      const userQuery = mongoose.Types.ObjectId.isValid(id)
        ? { _id: id }
        : isNaN(Number(id))
          ? { userId: id }
          : { id: Number(id) };

      const targetUser = await User.findOne(userQuery);
      if (!targetUser) {
        res.status(404).json({ success: false, message: "User not found." });
        return;
      }

      if (
        targetUser._id.toString() === currentUser._id.toString() ||
        targetUser.username === currentUser.username
      ) {
        res.status(400).json({
          success: false,
          message: "Security policy: You cannot delete your own account.",
        });
        return;
      }

      const currentUserRole = currentUser.adminRole || currentUser.role;

      if (isAdmin(currentUserRole)) {
        if (isAdmin(targetUser.adminRole || targetUser.role) || isSuperAdmin(targetUser.adminRole || targetUser.role)) {
          res.status(403).json({
            success: false,
            message: "Access denied: Administrators cannot delete other Administrators.",
          });
          return;
        }
        if (!isStaffOwner(currentUser, targetUser)) {
          res.status(403).json({
            success: false,
            message: "Access denied: You can only delete your assigned staff accounts.",
          });
          return;
        }
      }

      await User.deleteOne({ _id: targetUser._id });

      res.json({
        success: true,
        message: `Account @${targetUser.username} (${targetUser.displayName}) deleted successfully.`,
      });
    } catch (err: any) {
      console.error("Error in deleteUser:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

export default adminUserController;
