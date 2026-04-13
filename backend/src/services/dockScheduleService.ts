import { prisma } from "../config/database";

interface CreateDockScheduleInput {
  facilityName: string;
  facilityAddress?: string;
  facilityCity: string;
  facilityState: string;
  facilityZip?: string;
  dockNumber?: string;
  appointmentDate: string;
  timeSlotStart: string;
  timeSlotEnd: string;
  loadId?: string;
  carrierId?: string;
  driverName?: string;
  driverPhone?: string;
  truckNumber?: string;
  trailerNumber?: string;
  appointmentType?: string;
  notes?: string;
}

export async function createDockSchedule(data: CreateDockScheduleInput, createdById: string) {
  // Check for conflicts
  const conflict = await prisma.dockSchedule.findFirst({
    where: {
      facilityName: data.facilityName,
      dockNumber: data.dockNumber || undefined,
      appointmentDate: new Date(data.appointmentDate),
      timeSlotStart: data.timeSlotStart,
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
    },
  });
  if (conflict) throw new Error("Time slot conflict: this dock/time is already booked");

  return prisma.dockSchedule.create({
    data: {
      ...data,
      appointmentDate: new Date(data.appointmentDate),
      appointmentType: data.appointmentType || "PICKUP",
      createdById,
    },
    include: {
      carrier: { select: { companyName: true, mcNumber: true } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });
}

export async function getDockSchedules(filters: {
  facilityName?: string;
  appointmentDate?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  appointmentType?: string;
  page: number;
  limit: number;
}) {
  const where: any = {};
  if (filters.facilityName) where.facilityName = { contains: filters.facilityName, mode: "insensitive" };
  if (filters.appointmentDate) where.appointmentDate = new Date(filters.appointmentDate);
  if (filters.dateFrom || filters.dateTo) {
    where.appointmentDate = {};
    if (filters.dateFrom) where.appointmentDate.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.appointmentDate.lte = new Date(filters.dateTo);
  }
  if (filters.status) where.status = filters.status;
  if (filters.appointmentType) where.appointmentType = filters.appointmentType;

  const [items, total] = await Promise.all([
    prisma.dockSchedule.findMany({
      where,
      include: {
        carrier: { select: { companyName: true, mcNumber: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ appointmentDate: "asc" }, { timeSlotStart: "asc" }],
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    prisma.dockSchedule.count({ where }),
  ]);

  return { items, total, totalPages: Math.ceil(total / filters.limit) };
}

export async function getDockSchedule(id: string) {
  const schedule = await prisma.dockSchedule.findUnique({
    where: { id },
    include: {
      carrier: { select: { companyName: true, mcNumber: true, contactPhone: true } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });
  if (!schedule) throw new Error("Dock schedule not found");
  return schedule;
}

export async function updateDockSchedule(id: string, data: Partial<CreateDockScheduleInput> & { status?: string; checkedInAt?: string; completedAt?: string; dwellTimeMinutes?: number }) {
  const updateData: any = { ...data };
  if (data.appointmentDate) updateData.appointmentDate = new Date(data.appointmentDate);
  if (data.checkedInAt) updateData.checkedInAt = new Date(data.checkedInAt);
  if (data.completedAt) updateData.completedAt = new Date(data.completedAt);

  // Auto-calculate dwell time
  if (data.status === "COMPLETED") {
    const existing = await prisma.dockSchedule.findUnique({ where: { id } });
    if (existing?.checkedInAt) {
      const completedAt = data.completedAt ? new Date(data.completedAt) : new Date();
      updateData.dwellTimeMinutes = Math.round((completedAt.getTime() - existing.checkedInAt.getTime()) / 60000);
      updateData.completedAt = completedAt;
    }
  }

  return prisma.dockSchedule.update({
    where: { id },
    data: updateData,
    include: {
      carrier: { select: { companyName: true, mcNumber: true } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });
}

export async function deleteDockSchedule(id: string) {
  return prisma.dockSchedule.update({ where: { id }, data: { status: "CANCELLED" } });
}

export async function getDockStats(facilityName?: string) {
  const where: any = {};
  if (facilityName) where.facilityName = facilityName;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [todayCount, scheduledCount, completedToday, avgDwell] = await Promise.all([
    prisma.dockSchedule.count({ where: { ...where, appointmentDate: { gte: today, lt: tomorrow } } }),
    prisma.dockSchedule.count({ where: { ...where, status: "SCHEDULED" } }),
    prisma.dockSchedule.count({ where: { ...where, status: "COMPLETED", completedAt: { gte: today } } }),
    prisma.dockSchedule.aggregate({ where: { ...where, dwellTimeMinutes: { not: null } }, _avg: { dwellTimeMinutes: true } }),
  ]);

  return { todayCount, scheduledCount, completedToday, avgDwellMinutes: Math.round(avgDwell._avg.dwellTimeMinutes || 0) };
}
