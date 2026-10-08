import catchAsync from '../utils/catchAsync.js';
import { success, created } from '../utils/apiResponse.js';
import { crewService, crewComplaintService } from '../services/index.js';

class CrewController {
  getProfile = catchAsync(async (req, res) => {
    const data = await crewService.getProfile(req.auth.sub);
    return success(res, data);
  });

  updatePersonal = catchAsync(async (req, res) => {
    const data = await crewService.updatePersonal(req.auth.sub, req.body);
    return success(res, data, { message: 'Personal information saved' });
  });

  updateWorkProfile = catchAsync(async (req, res) => {
    const data = await crewService.updateWorkProfile(req.auth.sub, req.body);
    return success(res, data, { message: 'Work profile saved' });
  });

  upsertIdentityDocuments = catchAsync(async (req, res) => {
    const data = await crewService.upsertIdentityDocuments(req.auth.sub, req.body);
    return success(res, data, { message: 'Identity documents saved' });
  });

  upsertBankDetails = catchAsync(async (req, res) => {
    const data = await crewService.upsertBankDetails(req.auth.sub, req.body);
    return success(res, data, { message: 'Bank details saved' });
  });

  listTimeOff = catchAsync(async (req, res) => {
    const data = await crewService.listTimeOff(req.auth.sub);
    return success(res, data);
  });

  addTimeOff = catchAsync(async (req, res) => {
    const data = await crewService.addTimeOff(req.auth.sub, req.body);
    return created(res, data, { message: 'Time off added' });
  });

  deleteTimeOff = catchAsync(async (req, res) => {
    await crewService.deleteTimeOff(req.auth.sub, req.params.id);
    return success(res, null, { message: 'Time off removed' });
  });

  listEmergencyContacts = catchAsync(async (req, res) => {
    const data = await crewService.listEmergencyContacts(req.auth.sub);
    return success(res, data);
  });

  createEmergencyContact = catchAsync(async (req, res) => {
    const data = await crewService.createEmergencyContact(req.auth.sub, req.body);
    return created(res, data, { message: 'Emergency contact saved' });
  });

  updateEmergencyContact = catchAsync(async (req, res) => {
    const data = await crewService.updateEmergencyContact(req.auth.sub, req.params.id, req.body);
    return success(res, data, { message: 'Emergency contact updated' });
  });

  deleteEmergencyContact = catchAsync(async (req, res) => {
    await crewService.deleteEmergencyContact(req.auth.sub, req.params.id);
    return success(res, null, { message: 'Emergency contact removed' });
  });

  setOnline = catchAsync(async (req, res) => {
    const data = await crewService.setOnline(req.auth.sub, req.body);
    return success(res, data, { message: data.isOnline ? 'You are online' : 'You are offline' });
  });

  submitForVerification = catchAsync(async (req, res) => {
    const data = await crewService.submitForVerification(req.auth.sub);
    return success(res, data, { message: 'Submitted for verification' });
  });

  createEditRequest = catchAsync(async (req, res) => {
    const data = await crewService.createEditRequest(req.auth.sub, req.body.changedFields);
    return created(res, data, { message: 'Change request submitted for review' });
  });

  listComplaintReasons = catchAsync(async (req, res) => {
    return success(res, crewComplaintService.listReasons());
  });

  listComplaintOrders = catchAsync(async (req, res) => {
    const data = await crewComplaintService.listOrders(req.auth.sub);
    return success(res, data);
  });

  createComplaint = catchAsync(async (req, res) => {
    const data = await crewComplaintService.create(req.auth.sub, req.body);
    return created(res, data, { message: 'Complaint submitted' });
  });

  listComplaints = catchAsync(async (req, res) => {
    const data = await crewComplaintService.list(req.auth.sub);
    return success(res, data);
  });

  listEditRequests = catchAsync(async (req, res) => {
    const data = await crewService.listEditRequests(req.auth.sub);
    return success(res, data);
  });
}

export default new CrewController();
