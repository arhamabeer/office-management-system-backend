import { Types } from 'mongoose';
import type { DepartmentDTO } from '@ems/types';
import type { CreateDepartmentInput, UpdateDepartmentInput } from '@ems/validation';
import type { AuthUser } from '../../middleware/auth';
import { Department, type DepartmentDoc } from './department.model';
import { EmployeeProfile } from '../employees/employeeProfile.model';
import { ConflictError, NotFoundError } from '../../common/errors';
import { recordAudit } from '../../middleware/audit';

function toDTO(d: DepartmentDoc): DepartmentDTO {
  return {
    id: String(d._id),
    name: d.name,
    code: d.code ?? undefined,
    parentId: d.parentId ? String(d.parentId) : undefined,
    managerId: d.managerId ? String(d.managerId) : undefined,
  };
}

export async function listDepartments(): Promise<DepartmentDTO[]> {
  const depts = await Department.find().sort({ name: 1 });
  return depts.map(toDTO);
}

export async function createDepartment(
  actor: AuthUser,
  input: CreateDepartmentInput,
): Promise<DepartmentDTO> {
  let ancestors: Types.ObjectId[] = [];
  let parentId: Types.ObjectId | undefined;
  if (input.parentId) {
    const parent = await Department.findById(input.parentId);
    if (!parent) throw new NotFoundError('Parent department not found');
    ancestors = [...(parent.ancestors ?? []), parent._id];
    parentId = parent._id;
  }
  const dept = await Department.create({
    name: input.name,
    code: input.code,
    parentId,
    ancestors,
    managerId: input.managerId ? new Types.ObjectId(input.managerId) : undefined,
  });
  await recordAudit({
    action: 'department.created',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'Department',
    targetId: String(dept._id),
  });
  return toDTO(dept);
}

export async function updateDepartment(
  actor: AuthUser,
  id: string,
  input: UpdateDepartmentInput,
): Promise<DepartmentDTO> {
  const dept = await Department.findById(id);
  if (!dept) throw new NotFoundError('Department not found');

  if (input.name !== undefined) dept.name = input.name;
  if (input.code !== undefined) dept.code = input.code;
  if (input.managerId !== undefined) dept.managerId = new Types.ObjectId(input.managerId);
  if (input.parentId !== undefined) {
    if (input.parentId) {
      if (input.parentId === id) throw new ConflictError('A department cannot be its own parent');
      const parent = await Department.findById(input.parentId);
      if (!parent) throw new NotFoundError('Parent department not found');
      dept.parentId = parent._id;
      dept.ancestors = [...(parent.ancestors ?? []), parent._id];
    } else {
      dept.parentId = undefined;
      dept.ancestors = [];
    }
  }
  await dept.save();
  await recordAudit({
    action: 'department.updated',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'Department',
    targetId: String(dept._id),
  });
  return toDTO(dept);
}

export async function deleteDepartment(actor: AuthUser, id: string): Promise<void> {
  const dept = await Department.findById(id);
  if (!dept) throw new NotFoundError('Department not found');
  const [children, members] = await Promise.all([
    Department.countDocuments({ parentId: dept._id }),
    EmployeeProfile.countDocuments({ departmentId: dept._id }),
  ]);
  if (children) throw new ConflictError('Cannot delete a department that has sub-departments');
  if (members) throw new ConflictError('Cannot delete a department that still has members');
  await dept.deleteOne();
  await recordAudit({
    action: 'department.deleted',
    actorId: actor.id,
    actorLabel: actor.email,
    targetType: 'Department',
    targetId: String(dept._id),
  });
}
