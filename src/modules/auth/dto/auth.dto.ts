import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Địa chỉ email không hợp lệ' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  @MaxLength(72)
  password!: string;

  @IsString()
  @IsNotEmpty({ message: 'Họ và tên là bắt buộc' })
  @MaxLength(200)
  fullName!: string;

  @IsString()
  @IsNotEmpty({ message: 'Số điện thoại là bắt buộc' })
  @MaxLength(20)
  phoneNumber!: string;
}

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập email hoặc số điện thoại' })
  @MaxLength(254)
  email!: string; // Hỗ trợ đăng nhập bằng Email hoặc Số điện thoại (BR-04)

  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu là bắt buộc' })
  @MaxLength(72)
  password!: string;
}
