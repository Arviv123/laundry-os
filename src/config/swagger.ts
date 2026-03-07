import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title:       'ERP System API',
      version:     '1.0.0',
      description: 'Unified ERP Backend — Tenants, Employees, Accounting (Double-Entry), Payroll (Israeli Law 2026), CRM, Invoicing',
      contact: { name: 'ERP Support' },
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Development' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        ApiSuccess: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data:    { type: 'object' },
            meta:    { type: 'object', properties: { total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' } } },
          },
        },
        ApiError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error:   { type: 'string'  },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password', 'tenantId'],
          properties: {
            email:    { type: 'string', format: 'email' },
            password: { type: 'string' },
            tenantId: { type: 'string' },
          },
        },
        RegisterRequest: {
          type: 'object',
          required: ['businessName', 'businessNumber', 'address', 'adminEmail', 'adminPassword', 'adminFirstName', 'adminLastName'],
          properties: {
            businessName:   { type: 'string' },
            businessNumber: { type: 'string', description: 'ח.פ. / ע.מ.' },
            vatNumber:      { type: 'string' },
            adminEmail:     { type: 'string', format: 'email' },
            adminPassword:  { type: 'string', minLength: 8 },
            adminFirstName: { type: 'string' },
            adminLastName:  { type: 'string' },
            address: {
              type: 'object',
              properties: {
                street: { type: 'string' },
                city:   { type: 'string' },
                zip:    { type: 'string' },
              },
            },
          },
        },
        CreateInvoice: {
          type: 'object',
          required: ['customerId', 'date', 'dueDate', 'lines'],
          properties: {
            customerId:   { type: 'string' },
            date:         { type: 'string', format: 'date-time' },
            dueDate:      { type: 'string', format: 'date-time' },
            notes:        { type: 'string' },
            paymentTerms: { type: 'string', example: '30 days' },
            lines: {
              type: 'array',
              items: {
                type: 'object',
                required: ['description', 'quantity', 'unitPrice'],
                properties: {
                  description: { type: 'string' },
                  quantity:    { type: 'number', minimum: 0 },
                  unitPrice:   { type: 'number', minimum: 0 },
                  vatRate:     { type: 'number', default: 0.18, minimum: 0, maximum: 1 },
                },
              },
            },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
    tags: [
      { name: 'Auth',       description: 'Authentication & Registration' },
      { name: 'Employees',  description: 'Employee & HR management' },
      { name: 'Accounting', description: 'Double-entry bookkeeping & reports' },
      { name: 'Payroll',    description: 'Israeli payroll engine (2026)' },
      { name: 'Invoices',   description: 'Invoicing & payments' },
      { name: 'CRM',        description: 'Customer relationship management' },
      { name: 'HR',         description: 'Leave management & holidays' },
      { name: 'Attendance', description: 'Time tracking' },
      { name: 'Audit',      description: 'Audit trail (compliance)' },
    ],
  },
  apis: ['./src/modules/**/*.routes.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
