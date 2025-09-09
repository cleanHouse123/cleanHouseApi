import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ async: false })
export class IsOptionalEnumConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    const [enumObject] = args.constraints;

    // Если значение undefined или null, то валидация проходит
    if (value === undefined || value === null) {
      return true;
    }

    // Проверяем, что значение есть в enum
    return Object.values(enumObject).includes(value);
  }

  defaultMessage(args: ValidationArguments) {
    const [enumObject] = args.constraints;
    const enumValues = Object.values(enumObject).join(', ');
    return `Значение должно быть одним из: ${enumValues}`;
  }
}

export function IsOptionalEnum(
  enumObject: object,
  validationOptions?: ValidationOptions,
) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [enumObject],
      validator: IsOptionalEnumConstraint,
    });
  };
}

