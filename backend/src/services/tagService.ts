import { prisma } from "../config/database";

// ─── Tag CRUD ───────────────────────────────────────────

export async function createTag(data: { name: string; color?: string; description?: string; entityTypes?: string[] }) {
  return prisma.tag.create({ data: { ...data, entityTypes: data.entityTypes || ["LOAD"] }, include: { rules: true } });
}

export async function getTags() {
  return prisma.tag.findMany({ include: { rules: true, _count: { select: { assignments: true } } }, orderBy: { name: "asc" } });
}

export async function updateTag(id: string, data: { name?: string; color?: string; description?: string; entityTypes?: string[] }) {
  return prisma.tag.update({ where: { id }, data, include: { rules: true } });
}

export async function deleteTag(id: string) {
  return prisma.tag.delete({ where: { id } });
}

// ─── Tag Rules ──────────────────────────────────────────

export async function createTagRule(tagId: string, data: { field: string; operator: string; value: string }) {
  return prisma.tagRule.create({ data: { tagId, ...data } });
}

export async function deleteTagRule(ruleId: string) {
  return prisma.tagRule.delete({ where: { id: ruleId } });
}

// ─── Tag Assignments ────────────────────────────────────

export async function assignTag(tagId: string, entityType: string, entityId: string, assignedBy?: string) {
  return prisma.tagAssignment.upsert({
    where: { tagId_entityType_entityId: { tagId, entityType, entityId } },
    update: {},
    create: { tagId, entityType, entityId, assignedBy },
  });
}

export async function removeTagAssignment(tagId: string, entityType: string, entityId: string) {
  return prisma.tagAssignment.deleteMany({ where: { tagId, entityType, entityId } });
}

export async function getEntityTags(entityType: string, entityId: string) {
  return prisma.tagAssignment.findMany({
    where: { entityType, entityId },
    include: { tag: true },
  });
}

// ─── Auto-Tagging Engine ────────────────────────────────

export async function autoTagEntity(entityType: string, entityId: string, entityData: Record<string, any>) {
  const tags = await prisma.tag.findMany({
    where: { entityTypes: { has: entityType } },
    include: { rules: { where: { isActive: true } } },
  });

  const matched: string[] = [];

  for (const tag of tags) {
    if (tag.rules.length === 0) continue;

    const allMatch = tag.rules.every((rule) => {
      const fieldValue = entityData[rule.field];
      if (fieldValue === undefined || fieldValue === null) return false;

      switch (rule.operator) {
        case "equals": return String(fieldValue).toLowerCase() === rule.value.toLowerCase();
        case "contains": return String(fieldValue).toLowerCase().includes(rule.value.toLowerCase());
        case "greaterThan": return Number(fieldValue) > Number(rule.value);
        case "lessThan": return Number(fieldValue) < Number(rule.value);
        case "in": return rule.value.split(",").map((v) => v.trim().toLowerCase()).includes(String(fieldValue).toLowerCase());
        default: return false;
      }
    });

    if (allMatch) {
      await assignTag(tag.id, entityType, entityId);
      matched.push(tag.name);
    }
  }

  return matched;
}
